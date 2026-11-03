// #597 / S2-02: «Registrar pago» desde la lista de Pedidos cobra SOLO el pedido entregado hoy.
// Si el cliente tiene una deuda que el reparto por antigüedad pagaría antes, o el pedido se vendió fiado,
// o se entregó otro día, se cobra en Fiados (reparto del más antiguo al más reciente, sin cambios).
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST, GET } from '@/app/api/pedidos/pagar-fiado/route'

let adminId: string
const post = (data: unknown) => new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
})
const get = (qs: string) => new NextRequest(`http://localhost/api/pedidos/pagar-fiado?${qs}`)
const HORA = 3600_000

/** Crea un cliente real; cada pedido es ENTREGADO con factura y saldo de 10.000. */
async function cliente() {
  const c = await db.cliente.create({ data: { nombre: 'Cobro del día sintético', telefono: randomUUID() } })
  const pedido = async (o: { creadoHaceHoras: number; entregadoHaceHoras?: number | null; promesa?: boolean }) => {
    const p = await db.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0,
      fecha: new Date(Date.now() - o.creadoHaceHoras * HORA),
      entregadoAt: o.entregadoHaceHoras == null ? null : new Date(Date.now() - o.entregadoHaceHoras * HORA),
      promesaPagoFecha: o.promesa ? new Date(Date.now() + 48 * HORA) : null } })
    await db.factura.create({ data: { pedidoId: p.id, clienteId: c.id, numero: 'D-' + randomUUID(),
      subtotal: 10000, total: 10000, montoPagado: 0, saldo: 10000 } })
    return p
  }
  return { c, pedido }
}
const saldoDe = async (id: string) => Number((await db.pedido.findUniqueOrThrow({ where: { id } })).saldo)
const paga = (clienteId: string, pedidoId: string, monto: number, extra: object = {}) =>
  POST(post({ clienteId, pedidoId, monto, metodo: 'EFECTIVO', offlineId: randomUUID(), ...extra }))
const codigo = async (r: Response) => (await r.json()).error.code

describe('#597 — cobro de un solo pedido entregado hoy', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => { mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01' }) })
  afterAll(disconnect)

  it('paga el pedido de hoy completo: Pago, espejo, factura PAGADA y sin saldo a favor', async () => {
    const { c, pedido } = await cliente()
    const hoy = await pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    const r = await paga(c.id, hoy.id, 10000)
    expect(r.status).toBe(200)
    expect((await r.json()).pagosAplicados.map((p: { pedidoId: string }) => p.pedidoId)).toEqual([hoy.id])
    expect(await saldoDe(hoy.id)).toBe(0)
    const pagos = await db.pago.findMany({ where: { pedidoId: hoy.id }, include: { abonoEspejo: true } })
    expect(pagos).toHaveLength(1)
    expect(pagos[0].abonoEspejo?.pagoOrigenId).toBe(pagos[0].id)
    const fac = await db.factura.findUniqueOrThrow({ where: { pedidoId: hoy.id } })
    expect(fac.estado).toBe('PAGADA'); expect(Number(fac.saldo)).toBe(0)
    expect(Number((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).saldoFavor)).toBe(0)
  })

  it('abono parcial con pago mixto sobre el pedido de hoy', async () => {
    const { c, pedido } = await cliente()
    const hoy = await pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    const version = (await (await GET(get(`clienteId=${c.id}&pedidoId=${hoy.id}`))).json()).preparacion.version
    const r = await POST(post({ clienteId: c.id, pedidoId: hoy.id, offlineId: randomUUID(), versionDeuda: version,
      pagos: [{ metodo: 'EFECTIVO', monto: 1500 }, { metodo: 'NEQUI', monto: 2500 }] }))
    expect(r.status).toBe(200)
    expect(await saldoDe(hoy.id)).toBe(6000)
    expect(await db.pago.count({ where: { pedidoId: hoy.id } })).toBe(2)
  })

  it('«del día» es la fecha de ENTREGA: hecho ayer y entregado hoy se cobra aquí; hecho hoy y entregado ayer, no', async () => {
    const { c, pedido } = await cliente()
    const hechoAyerEntregadoHoy = await pedido({ creadoHaceHoras: 30, entregadoHaceHoras: 0 })
    expect((await paga(c.id, hechoAyerEntregadoHoy.id, 10000)).status).toBe(200)
    const otro = await cliente()
    const entregadoAyer = await otro.pedido({ creadoHaceHoras: 30, entregadoHaceHoras: 30 })
    const r = await paga(otro.c.id, entregadoAyer.id, 10000)
    expect(r.status).toBe(409); expect(await codigo(r)).toBe('PEDIDO_NO_ES_DEL_DIA')
    expect(await saldoDe(entregadoAyer.id)).toBe(10000)
  })

  it('sin fecha de entrega registrada se usa la fecha del pedido (ventas inmediatas antiguas)', async () => {
    const { c, pedido } = await cliente()
    const viejo = await pedido({ creadoHaceHoras: 30, entregadoHaceHoras: null })
    const r = await paga(c.id, viejo.id, 10000)
    expect(r.status).toBe(409); expect(await codigo(r)).toBe('PEDIDO_NO_ES_DEL_DIA')
  })

  it('un pedido de hoy vendido fiado a propósito (promesa de pago) se cobra en Fiados', async () => {
    const { c, pedido } = await cliente()
    const fiado = await pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0, promesa: true })
    const r = await paga(c.id, fiado.id, 10000)
    expect(r.status).toBe(409); expect(await codigo(r)).toBe('PEDIDO_VENDIDO_FIADO')
    expect(await saldoDe(fiado.id)).toBe(10000)
    expect((await GET(get(`clienteId=${c.id}&pedidoId=${fiado.id}`))).status).toBe(409)
  })

  it('con deuda anterior el dinero NO va al pedido de hoy: se rechaza y el cobro de Fiados paga la más antigua', async () => {
    const { c, pedido } = await cliente()
    const antiguo = await pedido({ creadoHaceHoras: 72, entregadoHaceHoras: 72 })
    const hoy = await pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    const r = await paga(c.id, hoy.id, 10000)
    expect(r.status).toBe(409); expect(await codigo(r)).toBe('CLIENTE_CON_DEUDA_ANTERIOR')
    expect(await saldoDe(hoy.id)).toBe(10000)
    expect(await db.pago.count({ where: { pedidoId: hoy.id } })).toBe(0)
    // Fiados (sin pedidoId): el mismo pago cubre primero la deuda más antigua, como siempre.
    const fiados = await POST(post({ clienteId: c.id, monto: 10000, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    expect(fiados.status).toBe(200)
    expect(await saldoDe(antiguo.id)).toBe(0)
    expect(await saldoDe(hoy.id)).toBe(10000)
  })

  it('una deuda posterior no estorba: pagar el pedido de hoy equivale a lo que haría el reparto por antigüedad', async () => {
    const { c, pedido } = await cliente()
    const primero = await pedido({ creadoHaceHoras: 2, entregadoHaceHoras: 1 })
    const segundo = await pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    expect((await paga(c.id, primero.id, 10000)).status).toBe(200)
    expect(await saldoDe(primero.id)).toBe(0)
    expect(await saldoDe(segundo.id)).toBe(10000)
    // El segundo ahora sí tiene una deuda anterior? No: ya se pagó, así que también se puede cobrar directo.
    expect((await paga(c.id, segundo.id, 10000)).status).toBe(200)
  })

  it('un monto mayor al saldo se rechaza: nunca genera saldo a favor desde un pedido', async () => {
    const { c, pedido } = await cliente()
    const hoy = await pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    const r = await paga(c.id, hoy.id, 10001)
    expect(r.status).toBe(400); expect(await codigo(r)).toBe('MONTO_EXCEDE_PEDIDO')
    expect(await saldoDe(hoy.id)).toBe(10000)
    expect(Number((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).saldoFavor)).toBe(0)
  })

  it('un pedido de otro cliente o ya pagado no tiene saldo por cobrar (400)', async () => {
    const a = await cliente(), b = await cliente()
    const hoyA = await a.pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    const hoyB = await b.pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    expect((await paga(a.c.id, hoyB.id, 100)).status).toBe(400)
    await paga(a.c.id, hoyA.id, 10000)
    expect((await paga(a.c.id, hoyA.id, 100)).status).toBe(400)
    expect(await saldoDe(hoyB.id)).toBe(10000)
  })

  it('reintento con la misma referencia no duplica; otra referencia con distinto cuerpo es 409', async () => {
    const { c, pedido } = await cliente()
    const hoy = await pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    const body = { clienteId: c.id, pedidoId: hoy.id, monto: 4000, metodo: 'EFECTIVO', offlineId: randomUUID() }
    expect((await POST(post(body))).status).toBe(200)
    const again = await POST(post(body))
    expect(again.status).toBe(200); expect((await again.json()).deduped).toBe(true)
    expect(await db.pago.count({ where: { pedidoId: hoy.id } })).toBe(1)
    expect(await saldoDe(hoy.id)).toBe(6000)
    expect((await POST(post({ ...body, monto: 5000 }))).status).toBe(409)
    expect(await saldoDe(hoy.id)).toBe(6000)
  })

  it('el cobro de Fiados (sin pedidoId) conserva el reparto del más antiguo al más reciente y la misma versión de deuda', async () => {
    const { c, pedido } = await cliente()
    const ayer = await pedido({ creadoHaceHoras: 30, entregadoHaceHoras: 30 })
    const hoy = await pedido({ creadoHaceHoras: 0, entregadoHaceHoras: 0 })
    const prep = (await (await GET(get(`clienteId=${c.id}`))).json()).preparacion
    expect(prep.pedidos).toHaveLength(2)
    expect(prep.pedidos[0]).not.toHaveProperty('entregadoAt')
    expect(prep).not.toHaveProperty('deudaAnterior')
    const r = await POST(post({ clienteId: c.id, monto: 12000, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    expect(r.status).toBe(200)
    expect(await saldoDe(ayer.id)).toBe(0)
    expect(await saldoDe(hoy.id)).toBe(8000)
  })
})
