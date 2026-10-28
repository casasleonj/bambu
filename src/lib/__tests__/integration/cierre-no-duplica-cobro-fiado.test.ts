// @tests #513 — el cierre de caja cuenta una sola vez el cobro de un fiado hecho con
// `pagar-fiado` (que escribe un Pago y un Abono espejo por el mismo dinero).
// Postgres real, handlers REALES; mira la base de datos y el resultado del cierre.

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

let adminId: string
let contador = 0
const unico = () => `cf-${randomUUID()}`

/** Un cliente con un pedido de 10 pacas ENTREGADO y debido por completo. */
async function clienteConFiado() {
  contador += 1
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `Cliente Cierre ${contador}`, telefono: `32000${String(contador).padStart(5, '0')}`, direccion: 'Calle 1', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
  })
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 10 }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
  })
  await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' } })
  const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
  return { clienteId: cliente.id, pedidoId: pedido.id, total: Number(fila.total) }
}

async function cobrar(clienteId: string, monto: number) {
  const req = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clienteId, monto, metodo: 'EFECTIVO', offlineId: unico() }),
  })
  const res = await pagarFiado(req)
  expect(res.status).toBe(200)
}

async function cierreDeHoy() {
  await testPrisma.cierreDia.deleteMany({})
  const req = { nextUrl: { searchParams: new URLSearchParams() } } as unknown as NextRequest
  const body = await (await cierreGet(req)).json()
  const c = body.cierre ?? body
  return { cobroVentasHoy: Number(c.cobroVentasHoy), cobroCartera: Number(c.cobroCartera) }
}

describe('#513 — el cierre no duplica el cobro de un fiado (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })

  it('un fiado cobrado hoy entra a la caja UNA vez (por el Pago), no dos', async () => {
    const f = await clienteConFiado()
    await cobrar(f.clienteId, f.total)

    // La base guarda el mismo dinero en dos filas: el Pago y su Abono espejo.
    expect(await testPrisma.pago.count({ where: { pedidoId: f.pedidoId } })).toBe(1)
    expect(await testPrisma.abono.count({ where: { pedidoId: f.pedidoId } })).toBe(1)

    const c = await cierreDeHoy()
    expect(c.cobroVentasHoy).toBe(f.total)
    expect(c.cobroCartera).toBe(0)
  })

  it('un abono suelto (sin Pago) sigue contando en la cartera del día', async () => {
    const f = await clienteConFiado()
    const factura = await testPrisma.factura.findFirstOrThrow({ where: { pedidoId: f.pedidoId } })
    const antes = await cierreDeHoy()
    await testPrisma.abono.create({
      data: { numero: `ABO-${unico().slice(0, 8)}`, facturaId: factura.id, clienteId: f.clienteId, pedidoId: f.pedidoId, monto: 7000, metodoPago: 'EFECTIVO', origenCobro: 'INDEPENDIENTE' },
    })
    const despues = await cierreDeHoy()
    expect(despues.cobroCartera - antes.cobroCartera).toBe(7000)
    expect(despues.cobroVentasHoy).toBe(antes.cobroVentasHoy)
  })

  it('dos fiados cobrados el mismo día suman cada uno una sola vez', async () => {
    const base = await cierreDeHoy()
    const a = await clienteConFiado()
    const b = await clienteConFiado()
    await cobrar(a.clienteId, a.total)
    await cobrar(b.clienteId, 5000)
    const c = await cierreDeHoy()
    expect(c.cobroVentasHoy - base.cobroVentasHoy).toBe(a.total + 5000)
    expect(c.cobroCartera).toBe(base.cobroCartera)
  })
})
