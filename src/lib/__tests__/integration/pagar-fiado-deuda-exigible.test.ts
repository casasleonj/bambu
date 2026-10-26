// @tests #514 — `pagar-fiado` reparte el abono primero sobre la deuda ya ENTREGADA (la misma
// que la app muestra como «Este cliente debe») y solo después sobre pedidos aún no entregados
// (pago anticipado). Nunca sobre anulados ni cancelados. Postgres real, handler REAL; cada
// prueba mira la base de datos.

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
import { crearPedidoUseCase } from '@/modules/pedidos'

let adminId: string
let contador = 0
const unico = () => `df-${randomUUID()}`

type Estado = 'ENTREGADO' | 'PENDIENTE' | 'CANCELADO' | 'ANULADO'

async function nuevoCliente() {
  contador += 1
  return testPrisma.cliente.create({
    data: { nombre: `Cliente Exigible ${contador}`, telefono: `33000${String(contador).padStart(5, '0')}`, direccion: 'Calle 1', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
  })
}

/** Un pedido de 10 pacas debido por completo, con el estado de entrega y la antigüedad pedidos. */
async function pedidoDebido(clienteId: string, estado: Estado, diasAtras: number) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 10 }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
  })
  await testPrisma.pedido.update({
    where: { id: pedido.id },
    data: {
      estadoEntrega: estado,
      estado,
      // La base exige estadoPago ANULADO en pedidos anulados/cancelados (chk_pedido_estadopago_proyectado).
      ...(estado === 'ANULADO' || estado === 'CANCELADO' ? { estadoPago: 'ANULADO' as const } : {}),
      fecha: new Date(Date.now() - diasAtras * 86_400_000),
    },
  })
  return pedido.id
}

async function cobrar(clienteId: string, monto: number) {
  const req = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clienteId, monto, metodo: 'EFECTIVO', offlineId: unico() }),
  })
  const res = await pagarFiado(req)
  expect(res.status).toBe(200)
  return (await res.json()) as Record<string, unknown>
}

const saldoDe = async (id: string) => Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).saldo)
const totalDe = async (id: string) => Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).total)

describe('#514 — pagar-fiado solo cobra primero la deuda exigible (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })

  it('un abono parcial paga la deuda entregada aunque haya un pedido más viejo sin entregar', async () => {
    const c = await nuevoCliente()
    const sinEntregar = await pedidoDebido(c.id, 'PENDIENTE', 5) // el más viejo, aún no se entrega
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 2)
    const total = await totalDe(entregado)

    await cobrar(c.id, 10000)

    expect(await saldoDe(entregado)).toBe(total - 10000)
    expect(await saldoDe(sinEntregar)).toBe(await totalDe(sinEntregar)) // intacto
  })

  it('al saldar la deuda entregada, lo que sobra sí adelanta el pedido sin entregar (anticipado)', async () => {
    const c = await nuevoCliente()
    const sinEntregar = await pedidoDebido(c.id, 'PENDIENTE', 5)
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 2)
    const total = await totalDe(entregado)

    await cobrar(c.id, total + 4000)

    expect(await saldoDe(entregado)).toBe(0)
    expect(await saldoDe(sinEntregar)).toBe((await totalDe(sinEntregar)) - 4000)
  })

  it('entre dos entregados sigue el más viejo primero', async () => {
    const c = await nuevoCliente()
    const nuevo = await pedidoDebido(c.id, 'ENTREGADO', 1)
    const viejo = await pedidoDebido(c.id, 'ENTREGADO', 6)

    await cobrar(c.id, 3000)

    expect(await saldoDe(viejo)).toBe((await totalDe(viejo)) - 3000)
    expect(await saldoDe(nuevo)).toBe(await totalDe(nuevo))
  })

  it('un pedido cancelado o anulado nunca recibe dinero', async () => {
    const c = await nuevoCliente()
    const cancelado = await pedidoDebido(c.id, 'CANCELADO', 9)
    const anulado = await pedidoDebido(c.id, 'ANULADO', 8)
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 1)
    const total = await totalDe(entregado)

    await cobrar(c.id, total)

    expect(await saldoDe(entregado)).toBe(0)
    expect(await testPrisma.pago.count({ where: { pedidoId: { in: [cancelado, anulado] } } })).toBe(0)
    expect(await saldoDe(cancelado)).toBe(await totalDe(cancelado))
    expect(await saldoDe(anulado)).toBe(await totalDe(anulado))
  })

  it('si solo hay pedidos cancelados/anulados con saldo, no hay deuda que cobrar', async () => {
    const c = await nuevoCliente()
    await pedidoDebido(c.id, 'ANULADO', 3)
    await pedidoDebido(c.id, 'CANCELADO', 2)
    const req = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: c.id, monto: 5000, metodo: 'EFECTIVO', offlineId: unico() }),
    })
    const res = await pagarFiado(req)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await testPrisma.pago.count({ where: { pedido: { clienteId: c.id } } })).toBe(0)
  })

  it('cobros en varios días, parcial y luego el resto: queda en cero sin pagar de más', async () => {
    const c = await nuevoCliente()
    const entregado = await pedidoDebido(c.id, 'ENTREGADO', 3)
    const total = await totalDe(entregado)

    await cobrar(c.id, 10000)
    await testPrisma.pago.updateMany({ where: { pedidoId: entregado }, data: { createdAt: new Date(Date.now() - 86_400_000) } })
    await cobrar(c.id, total - 10000)

    expect(await saldoDe(entregado)).toBe(0)
    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: entregado } })
    expect(pagos.reduce((s, p) => s + Number(p.monto), 0)).toBe(total)
  })
})
