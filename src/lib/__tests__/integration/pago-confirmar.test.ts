// @tests /api/pagos/por-confirmar (GET) + /api/pagos/[id]/confirmar (POST)
// ADR-PAGO-REPORTADO-CONFIRMADO-001 — g pago-confirmado.2.
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'

const authUser = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/config', () => ({ getConfig: vi.fn(async () => configHolder.value) }))

const configHolder: { value: string | null } = { value: null }

function getReq(qs = '') {
  return { nextUrl: { searchParams: new URLSearchParams(qs) } } as unknown as import('next/server').NextRequest
}
function postReq(body: unknown) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

async function seedPagoReportado(monto = 10000) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre: 'Cli Pago', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true },
  })
  const pedido = await testPrisma.pedido.create({
    data: { clienteId: cliente.id, canal: 'DOMICILIO', total: monto, totalPagado: monto, saldo: 0, estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO' },
  })
  const pago = await testPrisma.pago.create({
    data: { pedidoId: pedido.id, metodo: 'NEQUI', monto, confirmacion: 'REPORTADO' },
  })
  return { cliente, pedido, pago }
}

describe('pago-confirmado.2', () => {
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    adminId = admin.id
    authUser.id = admin.id
  })

  afterEach(() => {
    configHolder.value = null
  })

  afterAll(async () => {
    await disconnect()
  })

  it('GET cola: 403 si USUARIO_CONFIRMA_PAGOS no está seteado', async () => {
    const { GET } = await import('@/app/api/pagos/por-confirmar/route')
    expect((await GET(getReq())).status).toBe(403)
  })

  it('GET cola: 403 si el usuario no es el designado', async () => {
    configHolder.value = 'otro-user-id'
    const { GET } = await import('@/app/api/pagos/por-confirmar/route')
    expect((await GET(getReq())).status).toBe(403)
  })

  it('GET cola: el designado ve los pagos REPORTADO enriquecidos', async () => {
    await seedPagoReportado(13000)
    configHolder.value = adminId
    const { GET } = await import('@/app/api/pagos/por-confirmar/route')
    const res = await GET(getReq('page=1&pageSize=50'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.length).toBeGreaterThanOrEqual(1)
    const item = json.data[0]
    expect(item.metodo).toBeDefined()
    expect(item.pedido.cliente.nombre).toBeDefined()
    expect(json.totales.montoPendiente).toBeGreaterThan(0)
  })

  it('POST confirmar CONFIRMADO: setea confirmadoPorId/At; sale de la cola', async () => {
    const { pago } = await seedPagoReportado()
    configHolder.value = adminId
    const { POST } = await import('@/app/api/pagos/[id]/confirmar/route')
    const res = await POST(postReq({ resultado: 'CONFIRMADO' }), { params: Promise.resolve({ id: pago.id }) })
    expect(res.status).toBe(201)

    const post = await testPrisma.pago.findUnique({ where: { id: pago.id } })
    expect(post?.confirmacion).toBe('CONFIRMADO')
    expect(post?.confirmadoPorId).toBe(adminId)
    expect(post?.confirmadoAt).toBeInstanceOf(Date)
  })

  it('POST confirmar DISCREPANTE: abre ResponsibilityCase, NO revierte el Pago; nota obligatoria', async () => {
    const { pago } = await seedPagoReportado(9000)
    configHolder.value = adminId
    const { POST } = await import('@/app/api/pagos/[id]/confirmar/route')

    // sin nota → 400
    const sinNota = await POST(postReq({ resultado: 'DISCREPANTE' }), { params: Promise.resolve({ id: pago.id }) })
    expect(sinNota.status).toBe(400)

    const res = await POST(
      postReq({ resultado: 'DISCREPANTE', nota: 'el cliente no aparece en la cuenta Nequi' }),
      { params: Promise.resolve({ id: pago.id }) },
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.responsibilityCaseId).toBeTruthy()

    const caso = await testPrisma.responsibilityCase.findUnique({ where: { id: json.responsibilityCaseId } })
    expect(caso?.tipo).toBe('PAGO_NO_CONFIRMADO')
    expect(Number(caso?.montoEstimado)).toBe(9000)

    // Pago NO se revierte: sigue existiendo con su monto
    const post = await testPrisma.pago.findUnique({ where: { id: pago.id } })
    expect(post?.confirmacion).toBe('DISCREPANTE')
    expect(Number(post?.monto)).toBe(9000)
  })

  it('POST confirmar: idempotente por estado (2do intento → deduped 200)', async () => {
    const { pago } = await seedPagoReportado()
    configHolder.value = adminId
    const { POST } = await import('@/app/api/pagos/[id]/confirmar/route')
    await POST(postReq({ resultado: 'CONFIRMADO' }), { params: Promise.resolve({ id: pago.id }) })
    const r2 = await POST(postReq({ resultado: 'DISCREPANTE', nota: 'x' }), { params: Promise.resolve({ id: pago.id }) })
    expect(r2.status).toBe(200)
    expect((await r2.json()).deduped).toBe(true)
    // sigue CONFIRMADO (no lo pisó el 2do intento)
    const post = await testPrisma.pago.findUnique({ where: { id: pago.id } })
    expect(post?.confirmacion).toBe('CONFIRMADO')
  })

  it('POST confirmar: 403 si no es el designado; 404 si el pago no existe', async () => {
    const { POST } = await import('@/app/api/pagos/[id]/confirmar/route')
    configHolder.value = 'otro'
    expect((await POST(postReq({ resultado: 'CONFIRMADO' }), { params: Promise.resolve({ id: 'x' }) })).status).toBe(403)
    configHolder.value = adminId
    expect(
      (await POST(postReq({ resultado: 'CONFIRMADO' }), { params: Promise.resolve({ id: uniqueId('nope') }) })).status,
    ).toBe(404)
  })
})
