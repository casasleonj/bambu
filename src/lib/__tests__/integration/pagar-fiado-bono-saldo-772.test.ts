// @tests #772 — BONO es consumo de saldo a favor, no un pago nuevo sin respaldo.
// PostgreSQL descartable + handler real, sin tocar registros de producción.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as pagarFiado } from '@/app/api/pedidos/pagar-fiado/route'
import { POST as crearAbono } from '@/app/api/abonos/route'
import { POST as corregirAbono } from '@/app/api/cartera/abonos/[id]/corregir/route'
import { idConsumoBonoAbono } from '@/lib/bono-saldo-favor'
import { AnularPedidoUseCase } from '@/modules/pedidos/application/use-cases/AnularPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

import { crearPedidoUseCase } from '@/modules/pedidos'
import { leerCobrosPeriodo } from '@/lib/cobros-periodo'
import { startOfDayInBogota } from '@/lib/date-helpers'
import { todayStringBogota } from '@/lib/dates'

let adminId: string
const unique = () => randomUUID()
let contador = 0

const req = (clienteId: string, pagos: { metodo: string; monto: number }[], offlineId: string = unique()) =>
  new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(pagos.length === 1
      ? { clienteId, metodo: pagos[0].metodo, monto: pagos[0].monto, offlineId }
      : { clienteId, pagos, offlineId, versionDeuda: '0'.repeat(64) }),
  })

async function fiado(): Promise<{ clienteId: string; pedidoId: string; facturaId: string; deuda: number }> {
  contador += 1
  const cliente = await testPrisma.cliente.create({
    data: { nombre: 'Cliente sintético BONO 772', telefono: `35${String(contador).padStart(8, '0')}`,
      direccion: 'Calle de pruebas', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
  })
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
    pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unique(),
  })
  await testPrisma.pedido.update({
    where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: 10 },
  })
  const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
  const factura = await testPrisma.factura.findFirstOrThrow({ where: { pedidoId: pedido.id } })
  return { clienteId: cliente.id, pedidoId: pedido.id, facturaId: factura.id, deuda: Number(fila.saldo) }
}
const fijarCredito = async (clienteId: string, valor: number) =>
  testPrisma.cliente.update({ where: { id: clienteId }, data: { saldoFavor: valor } })
const credito = async (clienteId: string) =>
  Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: clienteId } })).saldoFavor)
const pagosDel = (pedidoId: string) => testPrisma.pago.findMany({ where: { pedidoId }, orderBy: { createdAt: 'asc' } })

describe('#772 — solo el saldo a favor disponible respalda BONO', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }))
  afterAll(disconnect)

  it('rechaza BONO sin saldo: pedido/factura/pagos/crédito intactos', async () => {
    const f = await fiado()
    const res = await pagarFiado(req(f.clienteId, [{ metodo: 'BONO', monto: 1500 }]))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('SALDO_FAVOR_INSUFICIENTE')
    expect(await credito(f.clienteId)).toBe(0)
    expect(await pagosDel(f.pedidoId)).toHaveLength(0)
    expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedidoId } })).saldo)).toBe(f.deuda)
  })

  it('BONO disponible se descuenta de forma atómica y no genera nuevo ingreso', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 5000)
    const res = await pagarFiado(req(f.clienteId, [{ metodo: 'BONO', monto: 3000 }]))
    expect(res.status).toBe(200)
    expect(await credito(f.clienteId)).toBe(2000)
    expect((await pagosDel(f.pedidoId)).map(p => [p.metodo, Number(p.monto)])).toEqual([['BONO', 3000]])
    expect(await testPrisma.ingresoSaldoFavor.count({ where: { clienteId: f.clienteId } })).toBe(0)
    const desde = startOfDayInBogota(todayStringBogota())
    const cobros = await leerCobrosPeriodo(testPrisma, desde, new Date(desde.getTime() + 86_400_000))
    expect(cobros.creditoAplicado).toBeGreaterThanOrEqual(3000)
  })

  it('rechaza BONO superior al disponible sin aplicar parcialmente la deuda', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 1000)
    const res = await pagarFiado(req(f.clienteId, [{ metodo: 'BONO', monto: 2000 }]))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('SALDO_FAVOR_INSUFICIENTE')
    expect(await credito(f.clienteId)).toBe(1000)
    expect(await pagosDel(f.pedidoId)).toHaveLength(0)
  })

  it('rechaza BONO no aplicable a la deuda y revierte toda la transacción', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, f.deuda + 3000)
    const res = await pagarFiado(req(f.clienteId, [{ metodo: 'BONO', monto: f.deuda + 1000 }]))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('BONO_SIN_DEUDA')
    expect(await credito(f.clienteId)).toBe(f.deuda + 3000)
    expect(await pagosDel(f.pedidoId)).toHaveLength(0)
    expect(await testPrisma.ingresoSaldoFavor.count({ where: { clienteId: f.clienteId } })).toBe(0)
  })

  it('reintento idempotente con mismo offlineId consume crédito una sola vez', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 5000)
    const ref = unique()
    const p = [{ metodo: 'BONO', monto: 3000 }]
    expect((await pagarFiado(req(f.clienteId, p, ref))).status).toBe(200)
    const repetido = await pagarFiado(req(f.clienteId, p, ref))
    expect(repetido.status).toBe(200)
    expect((await repetido.json()).deduped).toBe(true)
    expect(await credito(f.clienteId)).toBe(2000)
    expect(await pagosDel(f.pedidoId)).toHaveLength(1)
  })

  it('efectivo que cubre toda la deuda y luego BONO no crea crédito ficticio', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 10000)
    const preparacion = await import('@/lib/fiados-cobro-server').then(x=>x.prepararCobroFiado(f.clienteId, testPrisma))
    const reqMixta = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clienteId: f.clienteId, offlineId: unique(), versionDeuda: preparacion?.version,
        pagos: [{ metodo: 'EFECTIVO', monto: f.deuda }, { metodo: 'BONO', monto: 1000 }] }),
    })
    const res = await pagarFiado(reqMixta)
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('BONO_SIN_DEUDA')
    expect(await credito(f.clienteId)).toBe(10000)
    expect(await pagosDel(f.pedidoId)).toHaveLength(0)
    expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedidoId } })).saldo)).toBe(f.deuda)
  })

  it('BONO + efectivo en una misma operación conserva ambos métodos y consume solo crédito solicitado', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 4000)
    const preparacion = await import('@/lib/fiados-cobro-server').then(x=>x.prepararCobroFiado(f.clienteId, testPrisma))
    const res = await pagarFiado(new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clienteId: f.clienteId, offlineId: unique(), versionDeuda: preparacion?.version,
        pagos: [{ metodo: 'BONO', monto: 2000 }, { metodo: 'EFECTIVO', monto: 4000 }] }),
    }))
    expect(res.status).toBe(200)
    expect(await credito(f.clienteId)).toBe(2000)
    expect((await pagosDel(f.pedidoId)).map(p=>p.metodo).sort()).toEqual(['BONO', 'EFECTIVO'])
    expect(await testPrisma.ingresoSaldoFavor.count({ where: { clienteId: f.clienteId } })).toBe(0)
  })

  it('POST /api/abonos rechaza BONO sin saldo y no cambia la factura', async () => {
    const f = await fiado()
    const res = await crearAbono(new NextRequest('http://localhost/api/abonos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facturaId: f.facturaId, clienteId: f.clienteId, pedidoId: f.pedidoId,
        monto: 1000, metodoPago: 'BONO', offlineId: unique() }),
    }))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('SALDO_FAVOR_INSUFICIENTE')
    expect(await testPrisma.abono.count({ where: { pedidoId: f.pedidoId } })).toBe(0)
    expect(Number((await testPrisma.factura.findUniqueOrThrow({ where: { id: f.facturaId } })).saldo)).toBe(f.deuda)
  })

  it('POST /api/abonos descuenta BONO una sola vez, incluso con reintento', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 5000)
    const offlineId = unique()
    const abonar = () => crearAbono(new NextRequest('http://localhost/api/abonos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facturaId: f.facturaId, clienteId: f.clienteId, pedidoId: f.pedidoId,
        monto: 1500, metodoPago: 'BONO', offlineId }),
    }))
    expect((await abonar()).status).toBe(201)
    const segundo = await abonar()
    expect(segundo.status).toBe(200)
    expect((await segundo.json()).deduped).toBe(true)
    expect(await credito(f.clienteId)).toBe(3500)
    expect(await testPrisma.abono.count({ where: { pedidoId: f.pedidoId } })).toBe(1)
    expect(await testPrisma.ingresoSaldoFavor.count({ where: { clienteId: f.clienteId } })).toBe(0)
    expect(Number((await testPrisma.factura.findUniqueOrThrow({ where: { id: f.facturaId } })).saldo)).toBe(f.deuda - 1500)
  })

  it('pagar-fiado y POST /api/abonos compiten por el mismo crédito, sin duplicarlo', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 1000)
    const resultados = await Promise.all([
      pagarFiado(req(f.clienteId, [{ metodo: 'BONO', monto: 1000 }])),
      crearAbono(new NextRequest('http://localhost/api/abonos', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facturaId: f.facturaId, clienteId: f.clienteId, pedidoId: f.pedidoId,
          monto: 1000, metodoPago: 'BONO', offlineId: unique() }),
      })),
    ])
    expect(resultados.filter(r => r.status === 200 || r.status === 201)).toHaveLength(1)
    expect(resultados.filter(r => r.status === 409)).toHaveLength(1)
    expect(await credito(f.clienteId)).toBe(0)
    expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedidoId } })).totalPagado)).toBe(1000)
  })

  it('BONO independiente: corrección parcial y reintento restituyen solo crédito realmente gastado', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 5000)
    const abonar = await crearAbono(new NextRequest('http://localhost/api/abonos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facturaId: f.facturaId, clienteId: f.clienteId, pedidoId: f.pedidoId,
        monto: 1500, metodoPago: 'BONO', offlineId: unique() }),
    }))
    expect(abonar.status).toBe(201)
    const respuesta = await abonar.json()
    const abonoId: string = respuesta.abono.id
    expect(await credito(f.clienteId)).toBe(3500)
    expect(await testPrisma.historial.findUnique({ where: { id: idConsumoBonoAbono(abonoId) } })).not.toBeNull()

    const off = unique()
    const corregir = (monto: number, ref = off) => corregirAbono(
      new NextRequest('http://localhost/api/cartera/abonos/' + abonoId + '/corregir', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'MONTO', montoRevertido: monto, motivo: 'Corrección sintética', correccionOfflineId: ref }),
      }),
      { params: Promise.resolve({ id: abonoId }) },
    )
    expect((await corregir(500)).status).toBe(201)
    expect(await credito(f.clienteId)).toBe(4000)
    const replay = await corregir(500)
    expect(replay.status).toBe(200)
    expect((await replay.json()).deduped).toBe(true)
    expect(await credito(f.clienteId)).toBe(4000)
    expect((await corregir(1000, unique())).status).toBe(201)
    expect(await credito(f.clienteId)).toBe(5000)
    expect(Number((await testPrisma.factura.findUniqueOrThrow({ where: { id: f.facturaId } })).montoPagado)).toBe(0)
  })

  it('BONO en pagar-fiado con Abono espejo también restituye el crédito al corregirse', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 3000)
    expect((await pagarFiado(req(f.clienteId, [{ metodo: 'BONO', monto: 2000 }]))).status).toBe(200)
    expect(await credito(f.clienteId)).toBe(1000)
    const abono = await testPrisma.abono.findFirstOrThrow({ where: { pedidoId: f.pedidoId, metodoPago: 'BONO' } })
    expect(await testPrisma.historial.findUnique({ where: { id: idConsumoBonoAbono(abono.id) } })).not.toBeNull()
    const res = await corregirAbono(new NextRequest('http://localhost/api/cartera/abonos/' + abono.id + '/corregir', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'MONTO', montoRevertido: 2000, motivo: 'Corrección BONO espejo', correccionOfflineId: unique() }),
    }), { params: Promise.resolve({ id: abono.id }) })
    expect(res.status).toBe(201)
    expect(await credito(f.clienteId)).toBe(3000)
    const saldoPedido = Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedidoId } })).saldo)
    expect(saldoPedido).toBe(f.deuda)
    const desde = startOfDayInBogota(todayStringBogota())
    const cobros = await leerCobrosPeriodo(testPrisma, desde, new Date(desde.getTime() + 86_400_000))
    const pago = (await pagosDel(f.pedidoId))[0]
    expect(cobros.movimientos.find(m => m.id === pago?.id)?.neto).toBe(0)
  })

  it('BONO histórico sin marcador no recibe crédito nuevo al corregirlo', async () => {
    const f = await fiado()
    // Simula el escritor legado sin descuento de saldo: no hay evidencia de consumo.
    const legacy = await testPrisma.abono.create({
      data: { numero: 'ABO-LEGADO-' + unique().slice(0, 8), facturaId: f.facturaId,
        clienteId: f.clienteId, pedidoId: f.pedidoId, monto: 1000,
        metodoPago: 'BONO', origenCobro: 'INDEPENDIENTE' },
    })
    await testPrisma.pedido.update({
      where: { id: f.pedidoId }, data: { totalPagado: 1000, saldo: f.deuda - 1000, estadoPago: 'PARCIAL' },
    })
    await testPrisma.factura.update({
      where: { id: f.facturaId }, data: { montoPagado: 1000, saldo: f.deuda - 1000, estado: 'PARCIAL' },
    })
    expect(await testPrisma.historial.findUnique({ where: { id: idConsumoBonoAbono(legacy.id) } })).toBeNull()
    const res = await corregirAbono(new NextRequest('http://localhost/api/cartera/abonos/' + legacy.id + '/corregir', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'MONTO', montoRevertido: 1000, motivo: 'Legado no debitado', correccionOfflineId: unique() }),
    }), { params: Promise.resolve({ id: legacy.id }) })
    expect(res.status).toBe(201)
    expect(await credito(f.clienteId)).toBe(0)
  })

  it('al ANULAR un fiado pagado con BONO devuelve crédito real una vez, sin borrar el Pago', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 5000)
    expect((await pagarFiado(req(f.clienteId, [{ metodo: 'BONO', monto: 2000 }]))).status).toBe(200)
    expect(await credito(f.clienteId)).toBe(3000)
    const servicio = new AnularPedidoUseCase(
      new PrismaPedidoRepository(), new PrismaFacturaRepository(),
      new PrismaNotaCreditoRepository(), new PrismaTransactionManager(),
    )
    const offlineId = unique()
    const primero = await servicio.execute({ pedidoId: f.pedidoId, motivo: 'Pedido cancelado, restaurar crédito', offlineId, actorId: adminId })
    expect(primero.saldoFavorBonoRestituido).toBe(2000)
    expect(await credito(f.clienteId)).toBe(5000)
    const segundo = await servicio.execute({ pedidoId: f.pedidoId, motivo: 'Reintento', offlineId, actorId: adminId })
    expect(segundo.deduped).toBe(true)
    expect(await credito(f.clienteId)).toBe(5000)
    expect(await pagosDel(f.pedidoId)).toHaveLength(1)
  })

  it('ANULAR después de corregir parte del BONO solo restituye el saldo neto no corregido', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 5000)
    const res = await crearAbono(new NextRequest('http://localhost/api/abonos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facturaId: f.facturaId, clienteId: f.clienteId, pedidoId: f.pedidoId,
        monto: 1500, metodoPago: 'BONO', offlineId: unique() }),
    }))
    expect(res.status).toBe(201)
    const { abono } = await res.json()
    expect(await credito(f.clienteId)).toBe(3500)
    const corr = await corregirAbono(new NextRequest('http://localhost/api/cartera/abonos/' + abono.id + '/corregir', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'MONTO', montoRevertido: 500,
        motivo: 'Corrección parcial del bono', correccionOfflineId: unique() }),
    }), { params: Promise.resolve({ id: abono.id }) })
    expect(corr.status).toBe(201)
    expect(await credito(f.clienteId)).toBe(4000)

    const servicio = new AnularPedidoUseCase(
      new PrismaPedidoRepository(), new PrismaFacturaRepository(),
      new PrismaNotaCreditoRepository(), new PrismaTransactionManager(),
    )
    const anulado = await servicio.execute({ pedidoId: f.pedidoId, motivo: 'Cancelar saldo restante', offlineId: unique(), actorId: adminId })
    expect(anulado.saldoFavorBonoRestituido).toBe(1000)
    expect(await credito(f.clienteId)).toBe(5000)
    expect(await testPrisma.correccionAbono.count({ where: { abonoId: abono.id } })).toBe(1)
  })

  it('dos solicitudes simultáneas distintas no pueden consumir crédito dos veces', async () => {
    const f = await fiado()
    await fijarCredito(f.clienteId, 3000)
    const p = [{ metodo: 'BONO', monto: 3000 }]
    const responses = await Promise.all([
      pagarFiado(req(f.clienteId, p, unique())),
      pagarFiado(req(f.clienteId, p, unique())),
    ])
    const statuses = responses.map(r => r.status)
    expect(statuses.filter(x => x === 200)).toHaveLength(1)
    expect(statuses.filter(x => x >= 400)).toHaveLength(1)
    expect(await credito(f.clienteId)).toBe(0)
    expect(await pagosDel(f.pedidoId)).toHaveLength(1)
  })
})
