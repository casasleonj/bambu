// @tests #796 (auditoría F5) — corregir un abono espera al lock de PEDIDO; no pisa a un cobro/entrega en curso
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { acquireAdvisoryLockTx } from '@/lib/locks'

const authUser: { id: string; role: string } = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))

const req = (body: unknown) => ({ json: async () => body }) as unknown as Request
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('#796 · corregir y el lock de PEDIDO', () => {
  let abonoId = ''
  let pedidoId = ''
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    authUser.id = admin.id
    const cliente = await testPrisma.cliente.create({ data: { nombre: 'Cli lock', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true } })
    const pedido = await testPrisma.pedido.create({ data: { clienteId: cliente.id, canal: 'DOMICILIO', total: 20000, totalPagado: 12000, saldo: 8000, estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PARCIAL' } })
    const factura = await testPrisma.factura.create({ data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId: cliente.id, pedidoId: pedido.id, subtotal: 20000, total: 20000, saldo: 8000, montoPagado: 12000, estado: 'PARCIAL' } })
    const abono = await testPrisma.abono.create({ data: { numero: `ABO-${uniqueId('a').slice(0, 8)}`, facturaId: factura.id, clienteId: cliente.id, pedidoId: pedido.id, monto: 12000, metodoPago: 'NEQUI', origenCobro: 'INDEPENDIENTE' } })
    abonoId = abono.id
    pedidoId = pedido.id
  })
  afterAll(async () => { await disconnect() })

  it('si otro flujo tiene el lock del pedido, la corrección espera y recién entonces aplica', async () => {
    let soltar: () => void = () => {}
    const compuerta = new Promise<void>((r) => { soltar = r })
    let tomado: () => void = () => {}
    const lockTomado = new Promise<void>((r) => { tomado = r })
    // Simula una entrega o cobro del repartidor, que solo toma el lock del pedido.
    const otro = testPrisma.$transaction(async (tx) => {
      await acquireAdvisoryLockTx(tx, 'PEDIDO', pedidoId)
      tomado()
      await compuerta
    }, { timeout: 30_000 })
    await lockTomado

    const { POST } = await import('@/app/api/cartera/abonos/[id]/corregir/route')
    let terminada = false
    const corr = POST(req({ tipo: 'MONTO', montoRevertido: 3000, motivo: 'prueba de lock' }) as never, { params: Promise.resolve({ id: abonoId }) })
      .then((r) => { terminada = true; return r })
    await dormir(1500)
    expect(terminada).toBe(false) // sigue esperando al lock del pedido

    soltar()
    await otro
    const res = await corr
    expect(res.status).toBe(201)
    const pedidoPost = await testPrisma.pedido.findUnique({ where: { id: pedidoId } })
    expect(Number(pedidoPost?.totalPagado)).toBe(9000)
  })
})
