// #597 / S2-02: «Registrar pago» desde la lista de Pedidos cobra SOLO el pedido del día.
// El de un día anterior es un fiado y se cobra en Fiados (reparto por antigüedad, sin cambios).
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

async function escenario() {
  const c = await db.cliente.create({ data: { nombre: 'Cobro del día sintético', telefono: randomUUID() } })
  const crear = async (horasAtras: number) => {
    const p = await db.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0,
      fecha: new Date(Date.now() - horasAtras * 3600_000) } })
    await db.factura.create({ data: { pedidoId: p.id, clienteId: c.id, numero: 'D-' + randomUUID(),
      subtotal: 10000, total: 10000, montoPagado: 0, saldo: 10000 } })
    return p
  }
  return { c, ayer: await crear(30), hoy: await crear(0) }
}
const saldoDe = async (id: string) => Number((await db.pedido.findUniqueOrThrow({ where: { id } })).saldo)

describe('#597 — cobro de un solo pedido del día', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => { mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01' }) })
  afterAll(disconnect)

  it('paga el pedido de hoy completo sin tocar la deuda anterior del cliente (aunque sea más antigua)', async () => {
    const { c, ayer, hoy } = await escenario()
    const r = await POST(post({ clienteId: c.id, pedidoId: hoy.id, monto: 10000, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    expect(r.status).toBe(200)
    const out = await r.json()
    expect(out.pagosAplicados.map((p: { pedidoId: string }) => p.pedidoId)).toEqual([hoy.id])
    expect(await saldoDe(hoy.id)).toBe(0)
    expect(await saldoDe(ayer.id)).toBe(10000)
    expect(await db.pago.count({ where: { pedidoId: ayer.id } })).toBe(0)
    const pagos = await db.pago.findMany({ where: { pedidoId: hoy.id }, include: { abonoEspejo: true } })
    expect(pagos).toHaveLength(1)
    expect(pagos[0].abonoEspejo?.pagoOrigenId).toBe(pagos[0].id)
    const fac = await db.factura.findUniqueOrThrow({ where: { pedidoId: hoy.id } })
    expect(fac.estado).toBe('PAGADA'); expect(Number(fac.saldo)).toBe(0)
    expect(Number((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).saldoFavor)).toBe(0)
  })

  it('abono parcial y pago mixto sobre el pedido de hoy', async () => {
    const { c, ayer, hoy } = await escenario()
    const r = await POST(post({ clienteId: c.id, pedidoId: hoy.id, offlineId: randomUUID(),
      versionDeuda: (await (await GET(get(`clienteId=${c.id}&pedidoId=${hoy.id}`))).json()).preparacion.version,
      pagos: [{ metodo: 'EFECTIVO', monto: 1500 }, { metodo: 'NEQUI', monto: 2500 }] }))
    expect(r.status).toBe(200)
    expect(await saldoDe(hoy.id)).toBe(6000)
    expect(await saldoDe(ayer.id)).toBe(10000)
    expect(await db.pago.count({ where: { pedidoId: hoy.id } })).toBe(2)
  })

  it('un pedido de un día anterior es un fiado: se rechaza (409) y no se escribe nada', async () => {
    const { c, ayer } = await escenario()
    const r = await POST(post({ clienteId: c.id, pedidoId: ayer.id, monto: 10000, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    expect(r.status).toBe(409)
    expect((await r.json()).error.code).toBe('PEDIDO_NO_ES_DEL_DIA')
    expect(await saldoDe(ayer.id)).toBe(10000)
    expect(await db.pago.count({ where: { pedidoId: ayer.id } })).toBe(0)
    const g = await GET(get(`clienteId=${c.id}&pedidoId=${ayer.id}`))
    expect(g.status).toBe(409)
  })

  it('un monto mayor al saldo se rechaza: nunca genera saldo a favor desde un pedido', async () => {
    const { c, hoy } = await escenario()
    const r = await POST(post({ clienteId: c.id, pedidoId: hoy.id, monto: 10001, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    expect(r.status).toBe(400)
    expect((await r.json()).error.code).toBe('MONTO_EXCEDE_PEDIDO')
    expect(await saldoDe(hoy.id)).toBe(10000)
    expect(Number((await db.cliente.findUniqueOrThrow({ where: { id: c.id } })).saldoFavor)).toBe(0)
  })

  it('un pedido de otro cliente, ya pagado o inexistente no tiene saldo por cobrar (400)', async () => {
    const { c, hoy } = await escenario()
    const otro = await escenario()
    const ajeno = await POST(post({ clienteId: c.id, pedidoId: otro.hoy.id, monto: 100, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    expect(ajeno.status).toBe(400)
    await POST(post({ clienteId: c.id, pedidoId: hoy.id, monto: 10000, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    const pagado = await POST(post({ clienteId: c.id, pedidoId: hoy.id, monto: 100, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    expect(pagado.status).toBe(400)
    expect(await saldoDe(otro.hoy.id)).toBe(10000)
  })

  it('reintento con la misma referencia no duplica el cobro; otra referencia con distinto cuerpo es 409', async () => {
    const { c, hoy } = await escenario()
    const offlineId = randomUUID()
    const body = { clienteId: c.id, pedidoId: hoy.id, monto: 4000, metodo: 'EFECTIVO', offlineId }
    expect((await POST(post(body))).status).toBe(200)
    const again = await POST(post(body))
    expect(again.status).toBe(200)
    expect((await again.json()).deduped).toBe(true)
    expect(await db.pago.count({ where: { pedidoId: hoy.id } })).toBe(1)
    expect(await saldoDe(hoy.id)).toBe(6000)
    const distinto = await POST(post({ ...body, monto: 5000 }))
    expect(distinto.status).toBe(409)
    expect(await saldoDe(hoy.id)).toBe(6000)
  })

  it('sin pedidoId el cobro de Fiados sigue repartiendo del más antiguo al más reciente', async () => {
    const { c, ayer, hoy } = await escenario()
    const r = await POST(post({ clienteId: c.id, monto: 12000, metodo: 'EFECTIVO', offlineId: randomUUID() }))
    expect(r.status).toBe(200)
    expect(await saldoDe(ayer.id)).toBe(0)
    expect(await saldoDe(hoy.id)).toBe(8000)
  })
})
