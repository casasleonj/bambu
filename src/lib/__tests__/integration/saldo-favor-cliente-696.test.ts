// @tests #696 — GET /api/clientes/[id]/saldo-favor: saldo y origen de cada movimiento. Postgres real, handlers REALES;
// el cobro de fiados se hace con pagar-fiado de verdad y cada prueba mira la respuesta contra la base de datos.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as pagarFiado } from '@/app/api/pedidos/pagar-fiado/route'
import { GET as saldoFavor } from '@/app/api/clientes/[id]/saldo-favor/route'
import { crearPedidoUseCase } from '@/modules/pedidos'

let adminId: string
let contador = 0
const unico = () => `sf696-${randomUUID()}`
const sesion = (role: string) => mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })

async function clienteConFiado(opts: { negocio?: boolean } = {}) {
  contador += 1
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `Pedro${contador}`, apellido: 'Gómez', telefono: `34000${String(contador).padStart(5, '0')}`, direccion: 'Calle 1', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
  })
  const negocio = opts.negocio
    ? await testPrisma.negocio.create({ data: { nombre: `Tienda Don Pedro ${contador}`, clienteId: cliente.id } })
    : null
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: cliente.id, negocioId: negocio?.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 10 }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
  })
  await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
  const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
  const total = Number(fila.total)
  // La aplicación crea la factura del pedido sola: se lee, no se crea otra.
  const factura = await testPrisma.factura.findFirst({ where: { pedidoId: pedido.id } })
  return { clienteId: cliente.id, pedidoId: pedido.id, numero: fila.numero, total, negocio, factura }
}

async function cobrar(clienteId: string, monto: number, metodo = 'EFECTIVO') {
  const res = await pagarFiado(new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clienteId, monto, metodo, offlineId: unico() }),
  }))
  expect(res.status).toBe(200)
}

const leer = (id: string) => saldoFavor(new NextRequest(`http://localhost/api/clientes/${id}/saldo-favor`), { params: Promise.resolve({ id }) })

describe('#696 GET /api/clientes/[id]/saldo-favor (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => sesion('ADMIN'))

  it('un cobro con sobrante: saldo, quién lo registró y el pedido, la factura y el negocio que se pagaban', async () => {
    const f = await clienteConFiado({ negocio: true })
    await cobrar(f.clienteId, f.total + 4000)

    const res = await leer(f.clienteId)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.saldo).toBe(4000)
    expect(body.saldo).toBe(Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: f.clienteId } })).saldoFavor))
    expect(body.cliente.nombre).toContain('Gómez')
    expect(body.hayMas).toBe(false)
    expect(body.movimientos).toHaveLength(1)
    const m = body.movimientos[0]
    expect(m).toMatchObject({ tipo: 'ENTRADA_COBRO', signo: 1, monto: 4000, metodo: 'EFECTIVO', origenTipo: 'PAGAR_FIADO' })
    expect(m.registro).toMatchObject({ rol: 'ADMIN' })
    expect(m.registro.nombre.length).toBeGreaterThan(0)
    expect(f.factura).not.toBeNull()
    expect(m.cobro.pedidos).toEqual([
      { id: f.pedidoId, numero: f.numero, factura: f.factura!.numero, negocio: f.negocio!.nombre, montoAplicado: f.total },
    ])
    expect(m.cobro.montoRecibido).toBe(f.total + 4000)
    expect(m.cobro.recibio).toBeNull() // cobro hecho desde el escritorio normal: no inventa quién recibió
    expect(typeof m.referencia).toBe('string')
  })

  it('el cobro del sobrante en dos medios genera dos entradas, cada una con su medio', async () => {
    const f = await clienteConFiado()
    await cobrar(f.clienteId, f.total + 1000, 'NEQUI')
    const body = await (await leer(f.clienteId)).json()
    expect(body.movimientos.map((x: { metodo: string }) => x.metodo)).toEqual(['NEQUI'])
  })

  it('correcciones y anulaciones: pedido, factura, quién autorizó, motivo y signo', async () => {
    const f = await clienteConFiado({ negocio: true })
    const autor = await testPrisma.user.findUniqueOrThrow({ where: { id: adminId } })
    await testPrisma.cliente.update({ where: { id: f.clienteId }, data: { saldoFavor: 1000 } })
    await testPrisma.pedidoSaldoFavorMovimiento.create({
      data: { pedidoId: f.pedidoId, clienteId: f.clienteId, tipo: 'ACREDITACION', monto: 1500, origenTipo: 'CORRECCION_PRECIO', origenId: unico(), motivo: 'Precio acordado distinto', autorId: adminId, createdAt: new Date('2026-11-02T21:30:00Z') },
    })
    await testPrisma.pedidoSaldoFavorMovimiento.create({
      data: { pedidoId: f.pedidoId, clienteId: f.clienteId, tipo: 'REVERSION_ANULACION', monto: 500, origenTipo: 'ANULACION', origenId: f.pedidoId, motivo: 'Pedido anulado por error', autorId: adminId, createdAt: new Date('2026-11-05T15:00:00Z') },
    })
    const body = await (await leer(f.clienteId)).json()
    expect(body.saldo).toBe(1000)
    expect(body.movimientos.map((x: { tipo: string; signo: number; monto: number }) => [x.tipo, x.signo, x.monto])).toEqual([
      ['REVERSION_ANULACION', -1, 500],
      ['ACREDITACION', 1, 1500],
    ])
    expect(body.movimientos[1]).toMatchObject({
      motivo: 'Precio acordado distinto',
      registro: { nombre: [autor.nombre, autor.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre', rol: 'ADMIN' },
      pedido: { numero: f.numero, factura: f.factura!.numero, negocio: f.negocio!.nombre },
    })
  })

  it('una auditoría con quien recibió el dinero lo muestra con su fecha', async () => {
    const f = await clienteConFiado()
    const auditoriaId = unico()
    await testPrisma.historial.create({
      data: {
        id: auditoriaId, entidad: 'Pedido', registroId: f.clienteId, accion: 'UPDATE', usuarioId: adminId,
        datos: JSON.stringify({
          operacion: 'COBRO_FIADO_V2',
          resultado: {
            montoRecibido: 14000, montoAplicado: 10000,
            pagosAplicados: [{ pedidoId: f.pedidoId, numero: f.numero, facturaNumero: null, montoAplicado: 10000 }],
            recepcion: { quien: 'REPARTIDOR', nombre: 'Carlos Mejía', fecha: '2026-11-08T18:05:00.000Z' },
          },
        }),
      },
    })
    await testPrisma.ingresoSaldoFavor.create({ data: { clienteId: f.clienteId, metodo: 'EFECTIVO', monto: 4000, origen: 'PAGAR_FIADO', auditoriaId, createdById: adminId } })
    const m = (await (await leer(f.clienteId)).json()).movimientos[0]
    expect(m.cobro.recibio).toEqual({ quien: 'REPARTIDOR', nombre: 'Carlos Mejía', fecha: '2026-11-08T18:05:00.000Z' })
    // La auditoría no trae factura: sale de la del pedido (existe en la base), no se inventa otra.
    expect(f.factura).not.toBeNull()
    expect(m.cobro.pedidos[0]).toMatchObject({ numero: f.numero, factura: f.factura!.numero })
  })

  it('un pedido de OTRO cliente en la auditoría no se muestra', async () => {
    const mio = await clienteConFiado()
    const ajeno = await clienteConFiado()
    const auditoriaId = unico()
    await testPrisma.historial.create({
      data: {
        id: auditoriaId, entidad: 'Pedido', registroId: mio.clienteId, accion: 'UPDATE', usuarioId: adminId,
        datos: JSON.stringify({ operacion: 'COBRO_FIADO_V2', resultado: { pagosAplicados: [{ pedidoId: ajeno.pedidoId, numero: ajeno.numero, montoAplicado: 1 }] } }),
      },
    })
    await testPrisma.ingresoSaldoFavor.create({ data: { clienteId: mio.clienteId, metodo: 'EFECTIVO', monto: 10, origen: 'PAGAR_FIADO', auditoriaId } })
    const m = (await (await leer(mio.clienteId)).json()).movimientos[0]
    expect(m.cobro.pedidos).toEqual([])
    expect(JSON.stringify(m)).not.toContain(ajeno.pedidoId)
  })

  it('una auditoría ilegible deja el cobro en null y conserva el resto del movimiento', async () => {
    const f = await clienteConFiado()
    const auditoriaId = unico()
    await testPrisma.historial.create({ data: { id: auditoriaId, entidad: 'Pedido', registroId: f.clienteId, accion: 'UPDATE', datos: 'no es json' } })
    await testPrisma.ingresoSaldoFavor.create({ data: { clienteId: f.clienteId, metodo: 'EFECTIVO', monto: 25, origen: 'PAGAR_FIADO', auditoriaId } })
    const res = await leer(f.clienteId)
    expect(res.status).toBe(200)
    const m = (await res.json()).movimientos[0]
    expect(m).toMatchObject({ tipo: 'ENTRADA_COBRO', monto: 25, cobro: null, registro: null })
  })

  it('un cliente sin saldo ni movimientos responde saldo 0 y lista vacía (no un error)', async () => {
    const f = await clienteConFiado()
    const body = await (await leer(f.clienteId)).json()
    expect(body).toMatchObject({ saldo: 0, movimientos: [], hayMas: false })
  })

  it('CONSUMIDOR_FINAL no tiene saldo a favor', async () => {
    await testPrisma.cliente.upsert({
      where: { id: 'CONSUMIDOR_FINAL' }, update: {},
      create: { id: 'CONSUMIDOR_FINAL', nombre: 'Consumidor Final', telefono: '', direccion: '', barrio: '', activo: false },
    })
    const body = await (await leer('CONSUMIDOR_FINAL')).json()
    expect(body).toMatchObject({ saldo: 0, movimientos: [] })
  })

  it('cliente inexistente: 404', async () => {
    expect((await leer('no-existe')).status).toBe(404)
  })

  it('sin sesión: 401; repartidor: 403; asistente y contador: 200', async () => {
    const f = await clienteConFiado()
    mockAuth.mockResolvedValue(null)
    expect((await leer(f.clienteId)).status).toBe(401)
    sesion('REPARTIDOR')
    expect((await leer(f.clienteId)).status).toBe(403)
    sesion('ASISTENTE')
    expect((await leer(f.clienteId)).status).toBe(200)
    sesion('CONTADOR')
    expect((await leer(f.clienteId)).status).toBe(200)
  })

  it('es de solo lectura: leer no cambia el saldo ni crea registros', async () => {
    const f = await clienteConFiado()
    await cobrar(f.clienteId, f.total + 700)
    const antes = [await testPrisma.ingresoSaldoFavor.count(), await testPrisma.historial.count(), Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: f.clienteId } })).saldoFavor)]
    await leer(f.clienteId); await leer(f.clienteId)
    const despues = [await testPrisma.ingresoSaldoFavor.count(), await testPrisma.historial.count(), Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: f.clienteId } })).saldoFavor)]
    expect(despues).toEqual(antes)
  })
})
