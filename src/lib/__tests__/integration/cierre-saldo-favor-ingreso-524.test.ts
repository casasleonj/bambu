// @tests #524 — el sobrante de `pagar-fiado` acreditado a saldo a favor es dinero que SÍ entró a la
// caja: el cierre de caja debe contarlo una sola vez (en efectivo o digital según el medio), y el
// consumo posterior del crédito no es un ingreso nuevo. Postgres real, handlers REALES; cada
// prueba mira la base de datos y el resultado del cierre.

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
import { GET as cierreGet } from '@/app/api/cierre/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { prepararCobroFiado } from '@/lib/fiados-cobro-server'
import { leerCobrosPeriodo } from '@/lib/cobros-periodo'
import { startOfDayInBogota } from '@/lib/date-helpers'
import { getTodayString } from '@/lib/dates'

let adminId: string
let contador = 0
const unico = () => `sf-${randomUUID()}`

/** Un cliente con un pedido de 10 pacas ENTREGADO y debido por completo. */
async function clienteConFiado() {
  contador += 1
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `Cliente Sobrante ${contador}`, telefono: `33000${String(contador).padStart(5, '0')}`, direccion: 'Calle 1', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
  })
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 10 }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
  })
  await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
  const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
  return { clienteId: cliente.id, pedidoId: pedido.id, total: Number(fila.total) }
}

async function cobrar(clienteId: string, monto: number, metodo = 'EFECTIVO', offlineId = unico()) {
  const req = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clienteId, monto, metodo, offlineId }),
  })
  const res = await pagarFiado(req)
  expect(res.status).toBe(200)
  return res.json()
}

async function cierreDeHoy() {
  await testPrisma.cierreDia.deleteMany({})
  const req = { nextUrl: { searchParams: new URLSearchParams() } } as unknown as NextRequest
  const body = await (await cierreGet(req)).json()
  const c = body.cierre ?? body
  return {
    cobroVentasHoy: Number(c.cobroVentasHoy), cobroCartera: Number(c.cobroCartera),
    cobroCarteraEfectivo: Number(c.cobroCarteraEfectivo),
    desglose: c.desgloseCobros as { cuadra: boolean; efectivo: number; digital: number; total: number },
  }
}

describe('#524 — el sobrante acreditado a saldo a favor entra al cierre (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })

  it('deuda de total y cobro de total+4000 en efectivo: el cierre cuenta los 4000 de más, en efectivo', async () => {
    const f = await clienteConFiado()
    const antes = await cierreDeHoy()
    const r = await cobrar(f.clienteId, f.total + 4000)
    expect(r.saldoFavorAcreditado).toBe(4000)

    expect(Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: f.clienteId } })).saldoFavor)).toBe(4000)
    const ingresos = await testPrisma.ingresoSaldoFavor.findMany({ where: { clienteId: f.clienteId } })
    expect(ingresos).toHaveLength(1)
    expect(ingresos[0]).toMatchObject({ metodo: 'EFECTIVO', origen: 'PAGAR_FIADO' })
    expect(Number(ingresos[0].monto)).toBe(4000)

    const despues = await cierreDeHoy()
    // La parte aplicada a la deuda sigue entrando por el Pago; el sobrante, por el ingreso propio.
    expect(despues.cobroVentasHoy - antes.cobroVentasHoy).toBe(f.total)
    expect(despues.cobroCartera - antes.cobroCartera).toBe(4000)
    expect(despues.cobroCarteraEfectivo - antes.cobroCarteraEfectivo).toBe(4000)
    expect(despues.desglose.cuadra).toBe(true)
  })

  it('el sobrante pagado por Nequi cuenta como cobro digital, no como efectivo', async () => {
    const f = await clienteConFiado()
    const antes = await cierreDeHoy()
    await cobrar(f.clienteId, f.total + 2500, 'NEQUI')
    const despues = await cierreDeHoy()
    expect(despues.cobroCartera - antes.cobroCartera).toBe(2500)
    expect(despues.cobroCarteraEfectivo - antes.cobroCarteraEfectivo).toBe(0)
    expect(despues.desglose.cuadra).toBe(true)
  })

  it('reintento con el mismo offlineId: el dinero entra una sola vez', async () => {
    const f = await clienteConFiado()
    const antes = await cierreDeHoy()
    const ref = unico()
    await cobrar(f.clienteId, f.total + 4000, 'EFECTIVO', ref)
    await cobrar(f.clienteId, f.total + 4000, 'EFECTIVO', ref)
    expect(await testPrisma.ingresoSaldoFavor.count({ where: { clienteId: f.clienteId } })).toBe(1)
    expect(Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: f.clienteId } })).saldoFavor)).toBe(4000)
    const despues = await cierreDeHoy()
    expect(despues.cobroCartera - antes.cobroCartera).toBe(4000)
  })

  it('un cobro exacto (sin sobrante) no crea ingreso de saldo a favor', async () => {
    const f = await clienteConFiado()
    const antes = await cierreDeHoy()
    await cobrar(f.clienteId, f.total)
    expect(await testPrisma.ingresoSaldoFavor.count({ where: { clienteId: f.clienteId } })).toBe(0)
    const despues = await cierreDeHoy()
    expect(despues.cobroCartera - antes.cobroCartera).toBe(0)
  })

  it('consumir el crédito después en un pedido nuevo NO es un ingreso nuevo', async () => {
    const f = await clienteConFiado()
    await cobrar(f.clienteId, f.total + 4000)
    const antes = await cierreDeHoy()
    // El pedido nuevo (10 pacas) consume los 4000 de crédito; el resto queda por cobrar.
    await crearPedidoUseCase.execute({
      clienteId: f.clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
    })
    expect(Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: f.clienteId } })).saldoFavor)).toBe(0)
    const despues = await cierreDeHoy()
    expect(despues.cobroCartera - antes.cobroCartera).toBe(0)
    expect(despues.cobroVentasHoy - antes.cobroVentasHoy).toBe(0)
    expect(await testPrisma.ingresoSaldoFavor.count({ where: { clienteId: f.clienteId } })).toBe(1)
  })

  it('cobro mixto con sobrante en dos medios: cada medio entra por separado y el cierre cuadra', async () => {
    const f = await clienteConFiado()
    const antes = await cierreDeHoy()
    const preparacion = await prepararCobroFiado(f.clienteId, testPrisma)
    const req = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: f.clienteId, offlineId: unico(), versionDeuda: preparacion!.version,
        pagos: [{ metodo: 'EFECTIVO', monto: f.total + 2000 }, { metodo: 'NEQUI', monto: 3000 }] }),
    })
    expect((await pagarFiado(req)).status).toBe(200)
    const ingresos = await testPrisma.ingresoSaldoFavor.findMany({ where: { clienteId: f.clienteId }, orderBy: { metodo: 'asc' } })
    expect(ingresos.map((i) => [i.metodo, Number(i.monto)])).toEqual([['EFECTIVO', 2000], ['NEQUI', 3000]])
    expect(Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id: f.clienteId } })).saldoFavor)).toBe(5000)
    const despues = await cierreDeHoy()
    expect(despues.cobroCartera - antes.cobroCartera).toBe(5000)
    expect(despues.cobroCarteraEfectivo - antes.cobroCarteraEfectivo).toBe(2000)
    expect(despues.desglose.cuadra).toBe(true)
  })

  it('el Dashboard cuenta el sobrante en su medio y ya no lo marca «por conciliar» (misma cifra que el cierre)', async () => {
    const f = await clienteConFiado()
    const hoy = getTodayString()
    const desde = startOfDayInBogota(hoy)
    const hasta = new Date(desde.getTime() + 86_400_000)
    const antes = await leerCobrosPeriodo(testPrisma, desde, hasta)
    await cobrar(f.clienteId, f.total + 4000, 'NEQUI')
    const despues = await leerCobrosPeriodo(testPrisma, desde, hasta)
    expect(despues.subtotalRegistrado - antes.subtotalRegistrado).toBe(f.total + 4000)
    expect(despues.porConciliar.filter((p) => p.motivo === 'SOBRANTE_SIN_COBRO')).toHaveLength(
      antes.porConciliar.filter((p) => p.motivo === 'SOBRANTE_SIN_COBRO').length)
    expect(despues.ingresosSaldoFavor).toHaveLength((antes.ingresosSaldoFavor ?? []).length + 1)
  })

  it('la base rechaza un ingreso en BONO o de monto cero (el crédito no es dinero nuevo)', async () => {
    const f = await clienteConFiado()
    await expect(testPrisma.ingresoSaldoFavor.create({ data: { clienteId: f.clienteId, metodo: 'BONO', monto: 100, origen: 'PAGAR_FIADO' } })).rejects.toThrow()
    await expect(testPrisma.ingresoSaldoFavor.create({ data: { clienteId: f.clienteId, metodo: 'EFECTIVO', monto: 0, origen: 'PAGAR_FIADO' } })).rejects.toThrow()
  })
})
