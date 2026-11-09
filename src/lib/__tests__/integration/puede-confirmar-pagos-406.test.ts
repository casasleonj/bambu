// @tests #406 — quien confirma pagos es quien tiene la casilla «Puede confirmar pagos» (User.puedeConfirmarPagos).
// Postgres real, handlers REALES de la cola, la confirmación, el cierre y la edición de usuarios.
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { testPrisma, resetAndSeed, disconnect } from './setup'

const authUser = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  // Respeta el rol de la sesión simulada: una lista de roles o un rol solo.
  requireRole: vi.fn(async (roles: string | string[]) => {
    const ok = (Array.isArray(roles) ? roles : [roles]).includes(authUser.role)
    return ok ? { user: authUser } : new Response(JSON.stringify({ success: false }), { status: 403 })
  }),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/config', () => ({ getConfig: vi.fn(async () => null), getConfigs: vi.fn(async () => ({})) }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))

const getReq = (qs = '') => ({ nextUrl: { searchParams: new URLSearchParams(qs) } }) as unknown as NextRequest
const postReq = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest
const putReq = (body: unknown) =>
  new NextRequest('http://localhost/api/users/x', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

let n = 0
async function usuario(rol: 'ADMIN' | 'ASISTENTE' | 'CONTADOR' | 'REPARTIDOR', over: { puedeConfirmarPagos?: boolean; activo?: boolean } = {}) {
  n += 1
  return testPrisma.user.create({
    data: { username: `conf406-${n}-${Date.now()}`, password: 'x', nombre: `Persona ${n}`, rol, activo: over.activo ?? true, puedeConfirmarPagos: over.puedeConfirmarPagos ?? false },
  })
}
function como(u: { id: string; rol: string }) { authUser.id = u.id; authUser.role = u.rol }

async function pagoReportado() {
  const cliente = await testPrisma.cliente.create({ data: { nombre: 'Cli 406', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true } })
  const pedido = await testPrisma.pedido.create({
    data: { clienteId: cliente.id, canal: 'DOMICILIO', total: 9000, totalPagado: 9000, saldo: 0, estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO' },
  })
  return testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'NEQUI', monto: 9000, confirmacion: 'REPORTADO' } })
}

describe('#406 — Puede confirmar pagos (Postgres real)', () => {
  beforeAll(async () => { await resetAndSeed() })
  afterAll(async () => { await disconnect() })
  beforeEach(() => { authUser.role = 'ADMIN' })

  it('quien tiene la casilla ve la cola y confirma; quien no la tiene recibe 403 (aunque sea ADMIN)', async () => {
    const pago = await pagoReportado()
    const con = await usuario('ASISTENTE', { puedeConfirmarPagos: true })
    const sin = await usuario('ADMIN')
    const { GET } = await import('@/app/api/pagos/por-confirmar/route')
    const { POST } = await import('@/app/api/pagos/[id]/confirmar/route')

    como(sin)
    expect((await GET(getReq())).status).toBe(403)
    expect((await POST(postReq({ resultado: 'CONFIRMADO' }), { params: Promise.resolve({ id: pago.id }) })).status).toBe(403)
    expect((await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).confirmacion).toBe('REPORTADO')

    como(con)
    expect((await GET(getReq())).status).toBe(200)
    const r = await POST(postReq({ resultado: 'CONFIRMADO' }), { params: Promise.resolve({ id: pago.id }) })
    expect([200, 201]).toContain(r.status)
    const despues = await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })
    expect(despues.confirmacion).toBe('CONFIRMADO')
    expect(despues.confirmadoPorId).toBe(con.id)
  })

  it('pueden ser varias personas a la vez', async () => {
    const a = await usuario('ASISTENTE', { puedeConfirmarPagos: true })
    const b = await usuario('CONTADOR', { puedeConfirmarPagos: true })
    const { GET } = await import('@/app/api/pagos/por-confirmar/route')
    for (const u of [a, b]) { como(u); expect((await GET(getReq())).status).toBe(200) }
  })

  it('un Repartidor no confirma aunque la columna esté en true, ni un usuario inactivo', async () => {
    const rep = await usuario('REPARTIDOR', { puedeConfirmarPagos: true })
    const inactivo = await usuario('ASISTENTE', { puedeConfirmarPagos: true, activo: false })
    const { GET } = await import('@/app/api/pagos/por-confirmar/route')
    for (const u of [rep, inactivo]) { como(u); expect((await GET(getReq())).status).toBe(403) }
  })

  it('PUT /api/users/[id]: solo el ADMIN la marca; Repartidor 409; cambiar a Repartidor la quita', async () => {
    const { PUT } = await import('@/app/api/users/[id]/route')
    const admin = await usuario('ADMIN')
    const asist = await usuario('ASISTENTE')
    const rep = await usuario('REPARTIDOR')

    como(asist)
    expect((await PUT(putReq({ puedeConfirmarPagos: true }), { params: Promise.resolve({ id: asist.id }) })).status).toBe(403)
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: asist.id } })).puedeConfirmarPagos).toBe(false)

    como(admin)
    expect((await PUT(putReq({ puedeConfirmarPagos: true }), { params: Promise.resolve({ id: asist.id }) })).status).toBe(200)
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: asist.id } })).puedeConfirmarPagos).toBe(true)

    expect((await PUT(putReq({ puedeConfirmarPagos: true }), { params: Promise.resolve({ id: rep.id }) })).status).toBe(409)
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: rep.id } })).puedeConfirmarPagos).toBe(false)

    expect((await PUT(putReq({ rol: 'REPARTIDOR' }), { params: Promise.resolve({ id: asist.id }) })).status).toBe(200)
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: asist.id } })).puedeConfirmarPagos).toBe(false)
  })

  it('el cierre le dice a quien no confirma quiénes sí lo hacen, y a quien confirma que puede', async () => {
    await testPrisma.user.updateMany({ data: { puedeConfirmarPagos: false } })
    const con = await usuario('ASISTENTE', { puedeConfirmarPagos: true })
    const otro = await usuario('CONTADOR')
    const { GET } = await import('@/app/api/cierre/route')
    await testPrisma.cierreDia.deleteMany({})

    como(otro)
    const sin = await (await GET(getReq())).json()
    expect((sin.cierre ?? sin).confirmaPagos).toMatchObject({ puede: false, nombre: expect.stringContaining('Persona') })

    como(con)
    const si = await (await GET(getReq())).json()
    expect((si.cierre ?? si).confirmaPagos).toMatchObject({ puede: true })
  })
})
