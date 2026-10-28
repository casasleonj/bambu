// #515: resultado y replay deben coincidir con los centavos realmente escritos.
import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { GET, POST } from '@/app/api/pedidos/pagar-fiado/route'
beforeAll(async () => { await resetAndSeed(); mockAuth.mockResolvedValue({ user: { id: (await getAdminUser()).id, role: 'ADMIN' } }) })
afterAll(() => disconnect())
it('0.30 recibido, 0.20 deuda y 0.10 crédito: resultado original y replay exactos', async () => {
  const cliente = await db.cliente.create({ data: { nombre: 'Centavos sintéticos', telefono: randomUUID() } })
  const pedido = await db.pedido.create({ data: { clienteId: cliente.id, canal: 'PUNTO', origen: 'VENTA_RAPIDA',
    estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE', total: 0.20, saldo: 0.20, totalPagado: 0 } })
  const prep = await GET(new NextRequest(`http://localhost/api/pedidos/pagar-fiado?clienteId=${cliente.id}`))
  const body = { clienteId: cliente.id, pagos: [{ metodo: 'EFECTIVO', monto: 0.30 }], offlineId: randomUUID(), versionDeuda: (await prep.json()).preparacion.version }
  const req = () => new NextRequest('http://localhost/api/pedidos/pagar-fiado', { method: 'POST', body: JSON.stringify(body) })
  const r = await POST(req()); expect(r.status).toBe(200)
  const result = await r.json()
  expect(result.montoRecibido).toBe(0.30)
  expect(result.montoAplicado).toBe(0.20)
  expect(result.saldoFavorAcreditado).toBe(0.10)
  expect(Number((await db.pago.findFirstOrThrow({ where: { pedidoId: pedido.id } })).monto)).toBe(0.20)
  expect(Number((await db.cliente.findUniqueOrThrow({ where: { id: cliente.id } })).saldoFavor)).toBe(0.10)
  expect((await (await POST(req())).json()).montoAplicado).toBe(0.20)
  expect(await db.pago.count({ where: { offlineId: body.offlineId } })).toBe(1)
})
