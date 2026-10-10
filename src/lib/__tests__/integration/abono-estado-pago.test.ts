// @tests POST /api/abonos — el abono sincroniza Pedido.estadoPago
// Bug: el abono suelto actualizaba Factura (estado PAGADA/PARCIAL) y
// Pedido.saldo/totalPagado, pero NO Pedido.estadoPago → la factura quedaba
// PAGADA y el pedido seguía PENDIENTE (y seguía contando como fiado).
// Se ejecuta el route real contra Postgres.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'

const authUser: { id: string; role: string } = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))

function req(body: unknown) {
  return { json: async () => body } as unknown as Request
}

async function seedFiado(total: number) {
  const cliente = await testPrisma.cliente.create({
    data: {
      nombre: 'Cli Abono',
      telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      direccion: 'x',
      activo: true,
    },
  })
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId: cliente.id,
      canal: 'PUNTO',
      total,
      totalPagado: 0,
      saldo: total,
      estadoEntrega: 'ENTREGADO',
      estado: 'ENTREGADO',
      estadoPago: 'PENDIENTE',
    },
  })
  const factura = await testPrisma.factura.create({
    data: {
      numero: `FAC-${uniqueId('f').slice(0, 8)}`,
      clienteId: cliente.id,
      pedidoId: pedido.id,
      subtotal: total,
      total,
      saldo: total,
      montoPagado: 0,
      estado: 'EMITIDA',
    },
  })
  return { cliente, pedido, factura }
}

async function abonar(f: Awaited<ReturnType<typeof seedFiado>>, monto: number) {
  const { POST } = await import('@/app/api/abonos/route')
  const res = await POST(
    req({ facturaId: f.factura.id, clienteId: f.cliente.id, pedidoId: f.pedido.id, monto, metodoPago: 'EFECTIVO' }) as never,
  )
  expect(res.status).toBe(201)
}

describe('POST /api/abonos — Pedido.estadoPago', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    authUser.id = admin.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('abono que salda la factura deja el pedido PAGADO', async () => {
    const f = await seedFiado(20000)
    await abonar(f, 20000)
    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedido.id }, include: { factura: true } })
    expect(p.factura?.estado).toBe('PAGADA')
    expect(Number(p.saldo)).toBe(0)
    expect(Number(p.totalPagado)).toBe(20000)
    expect(p.estadoPago).toBe('PAGADO')
  })

  it('abono parcial deja el pedido PARCIAL y el siguiente lo completa a PAGADO', async () => {
    const f = await seedFiado(30000)
    await abonar(f, 10000)
    let p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedido.id }, include: { factura: true } })
    expect(p.factura?.estado).toBe('PARCIAL')
    expect(p.estadoPago).toBe('PARCIAL')

    await abonar(f, 20000)
    p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedido.id }, include: { factura: true } })
    expect(p.factura?.estado).toBe('PAGADA')
    expect(p.estadoPago).toBe('PAGADO')
  })
})
