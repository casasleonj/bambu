import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST, GET } from '@/app/api/pedidos/pagar-fiado/route'
import * as audit from '@/lib/audit'
import { publishRealtimeEvent } from '@/lib/realtime'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { idResultadoFiado } from '@/lib/fiados-cobro-server'
let adminId: string
const req = (data: unknown) => new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
})
async function preparacion(clienteId: string) {
  const r = await GET(new NextRequest(`http://localhost/api/pedidos/pagar-fiado?clienteId=${clienteId}`))
  expect(r.status).toBe(200)
  return (await r.json()).preparacion
}
async function escenario() {
  const c = await db.cliente.create({ data: { nombre: 'Cobro mixto sintético', telefono: randomUUID() } })
  const pedidos = []
  for (const [dias, estado] of [[10, 'PENDIENTE'], [5, 'ENTREGADO'], [0, 'ENTREGADO']] as const) {
    const p = await db.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      estado, estadoEntrega: estado, estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0,
      fecha: new Date(Date.now() - dias * 86400000) } })
    await db.factura.create({ data: { pedidoId: p.id, clienteId: c.id, numero: 'M-' + randomUUID(),
      subtotal: 10000, total: 10000, montoPagado: 0, saldo: 10000 } })
    pedidos.push(p)
  }
  const prep = await preparacion(c.id)
  const body = { clienteId: c.id, versionDeuda: prep.version, offlineId: randomUUID(),
    pagos: [{ metodo: 'EFECTIVO', monto: 5000 }, { metodo: 'NEQUI', monto: 12000 }] }
  return { c, pedidos, prep, body }
}
describe('#515/#498 — revisión, cobro mixto y resultado estable', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01' })
    vi.mocked(publishRealtimeEvent).mockResolvedValue(undefined)
    vi.mocked(notifyEvent).mockResolvedValue(undefined)
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(disconnect)
  it('aplica los medios en una tx, FIFO entregado y espejos 1:1; no anticipa el pendiente', async () => {
    const { c, pedidos, body } = await escenario()
    const r = await POST(req(body)); expect(r.status).toBe(200)
    const result = await r.json()
    expect(result).toMatchObject({ montoRecibido: 17000, montoAplicado: 17000, montoSobrante: 0 })
    expect(result.pagosAplicados.map((p: { montoAplicado: number }) => p.montoAplicado)).toEqual([10000, 7000])
    expect(Number((await db.pedido.findUniqueOrThrow({ where: { id: pedidos[0].id } })).saldo)).toBe(10000)
    const pagos = await db.pago.findMany({ where: { offlineId: body.offlineId }, include: { abonoEspejo: true } })
    expect(pagos).toHaveLength(3)
    for (const pago of pagos) {
      expect(pago.abonoEspejo?.pagoOrigenId).toBe(pago.id)
      expect(Number(pago.abonoEspejo?.monto)).toBe(Number(pago.monto))
      expect(pago.confirmacion).toBe(pago.metodo === 'EFECTIVO' ? 'CONFIRMADO' : 'REPORTADO')
    }
    expect(await db.receivableEntry.count({ where: { clienteId: c.id } })).toBe(3)
    const facturas = await db.factura.findMany({ where: { pedidoId: { in: pedidos.slice(1).map(p => p.id) } }, orderBy: { saldo: 'asc' } })
    expect(facturas.map(f => Number(f.saldo))).toEqual([0, 3000])
  })
  it('repite el resultado original aunque después cambien los saldos', async () => {
    const { c, body } = await escenario()
    const first = await (await POST(req(body))).json()
    const prep = await preparacion(c.id)
    expect((await POST(req({ ...body, offlineId: randomUUID(), versionDeuda: prep.version, pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] }))).status).toBe(200)
    const replay = await (await POST(req(body))).json()
    expect(replay).toMatchObject({ ...first, deduped: true, mensaje: 'Pago ya registrado; se conserva el resultado original.' })
    const get = await GET(new NextRequest(`http://localhost/api/pedidos/pagar-fiado?clienteId=${c.id}&offlineId=${body.offlineId}`))
    expect((await get.json()).pagosAplicados).toEqual(first.pagosAplicados)
    expect(await db.pago.count({ where: { offlineId: body.offlineId } })).toBe(3)
  })
  it('dos solicitudes simultáneas con la misma referencia crean un único cobro', async () => {
    const { body } = await escenario()
    const responses = await Promise.all([POST(req(body)), POST(req(body))])
    expect(responses.map(r => r.status)).toEqual([200, 200])
    expect((await Promise.all(responses.map(r => r.json()))).filter(r => r.deduped)).toHaveLength(1)
    expect(await db.pago.count({ where: { offlineId: body.offlineId } })).toBe(3)
    expect(await db.historial.count({ where: { id: idResultadoFiado(body.offlineId) } })).toBe(1)
  })
  it('deuda cambiada exige nueva revisión y no crea pagos ni resultado parcial', async () => {
    const { c, body } = await escenario()
    expect((await POST(req({ ...body, offlineId: randomUUID(), pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] }))).status).toBe(200)
    const stale = await POST(req(body)); expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe('DEUDA_CAMBIO')
    expect(await db.pago.count({ where: { offlineId: body.offlineId } })).toBe(0)
    const fresh = await preparacion(c.id)
    expect((await POST(req({ ...body, versionDeuda: fresh.version }))).status).toBe(200)
  })
  it('dos referencias diferentes con la misma revisión no cobran en silencio otro reparto', async () => {
    const { body } = await escenario()
    const responses = await Promise.all([POST(req(body)), POST(req({ ...body, offlineId: randomUUID() }))])
    expect(responses.map(r => r.status).sort()).toEqual([200, 409])
  })
  it('rechaza reutilizar la referencia con otro importe sin cambiar los hechos', async () => {
    const { body } = await escenario(); expect((await POST(req(body))).status).toBe(200)
    const r = await POST(req({ ...body, pagos: [{ metodo: 'EFECTIVO', monto: 999 }] }))
    expect(r.status).toBe(409)
    expect((await r.json()).error.code).toBe('REFERENCIA_COBRO_DISTINTA')
    expect(await db.pago.count({ where: { offlineId: body.offlineId } })).toBe(3)
  })
  it('la misma referencia en clientes distintos no mezcla carteras ni deja escrituras parciales', async () => {
    const uno = await escenario(), dos = await escenario()
    const responses = await Promise.all([POST(req(uno.body)), POST(req({ ...dos.body, offlineId: uno.body.offlineId }))])
    expect(responses.map(r => r.status).sort()).toEqual([200, 409])
    const pagos = await db.pago.findMany({ where: { offlineId: uno.body.offlineId }, include: { pedido: true } })
    expect(pagos).toHaveLength(3)
    expect(new Set(pagos.map(p => p.pedido.clienteId)).size).toBe(1)
    const perdedor = pagos[0].pedido.clienteId === uno.c.id ? dos.c.id : uno.c.id
    expect(await db.pago.count({ where: { pedido: { clienteId: perdedor } } })).toBe(0)
    const deuda = await db.pedido.findMany({ where: { clienteId: perdedor, estadoEntrega: 'ENTREGADO' } })
    expect(deuda.every(p => Number(p.saldo) === 10000)).toBe(true)
  })
  it('un fallo de auditoría revierte pagos, abonos, factura y deuda de todas las líneas', async () => {
    const { pedidos, body } = await escenario()
    vi.spyOn(audit, 'logAudit').mockRejectedValueOnce(new Error('AUDITORIA_SINTETICA'))
    expect((await POST(req(body))).status).toBe(500)
    expect(await db.pago.count({ where: { offlineId: body.offlineId } })).toBe(0)
    expect(await db.abono.count({ where: { pedidoId: { in: pedidos.map(p => p.id) } } })).toBe(0)
    expect((await db.factura.findMany({ where: { pedidoId: { in: pedidos.map(p => p.id) } } })).every(f => Number(f.saldo) === 10000)).toBe(true)
    expect(await db.historial.findUnique({ where: { id: idResultadoFiado(body.offlineId) } })).toBeNull()
  })
  it('exige identidad y revisión para el cuerpo mixto y rechaza fracciones de centavo', async () => {
    const { body } = await escenario()
    const { offlineId: _id, versionDeuda: _v, ...sinRevision } = body
    expect((await POST(req(sinRevision))).status).toBe(400)
    expect((await POST(req({ ...body, pagos: [{ metodo: 'EFECTIVO', monto: 1.234 }] }))).status).toBe(400)
    expect(await db.pago.count({ where: { offlineId: body.offlineId } })).toBe(0)
  })
})
