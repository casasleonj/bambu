// @tests A.10 #2 (plan de convergencia Embarques) — "dos operadores
// concurrentes" solo estaba probado para Recovery; asignación/envío/cierre
// solo tenían tests de FORMA (regex verificando que el route usa
// `executeSerializableWithRetry`, sin ejecutar concurrencia real —
// ver src/app/api/embarques/[id]/enviar/__tests__/route.test.ts).
//
// Este test ejecuta el POST real de /api/embarques/[id]/enviar dos veces
// EN PARALELO, para dos embarques ABIERTO distintos del MISMO trabajador,
// contra Postgres real. Verifica la regla de negocio "un trabajador no
// puede tener 2 embarques EN_RUTA simultáneos" (documentada en
// ADR-ARQUITECTURA-001, hoy solo vive en este route.ts, ver A.3.1) bajo
// la race real que el fix F-N1 (Serializable + retry) dice prevenir.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'

// Evita jalar el runtime de next-auth (mismo motivo que idor-permisos.test.ts):
// mockeamos auth-check ANTES de importar el route, así el módulo real
// (que sí importa next-auth) nunca se evalúa.
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 'admin-test', role: 'ADMIN' } })),
  requireRole: vi.fn(async () => ({ user: { id: 'admin-test', role: 'ADMIN' } })),
  requireOwnership: vi.fn(async () => true),
}))
// Efectos colaterales fire-and-forget que no necesitamos en el test y que
// tocan Redis/push — no-op para mantenerlo hermético.
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn(async () => {}) }))

describe('POST /api/embarques/[id]/enviar — concurrencia real (A.10 #2)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    await getAdminUser()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('dos embarques ABIERTO del mismo trabajador, enviados en paralelo: solo uno queda EN_RUTA', async () => {
    const { POST } = await import('@/app/api/embarques/[id]/enviar/route')

    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Concurrencia Enviar', rol: 'REPARTIDOR', usaMoto: true },
    })
    const embarqueA = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'ABIERTO' },
    })
    const embarqueB = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'ABIERTO' },
    })

    function fakeRequest() {
      return { json: async () => ({}) } as unknown as Request
    }

    const results = await Promise.allSettled([
      POST(fakeRequest() as never, { params: Promise.resolve({ id: embarqueA.id }) }),
      POST(fakeRequest() as never, { params: Promise.resolve({ id: embarqueB.id }) }),
    ])

    // Ambas promesas deben resolver (la ruta captura sus propios errores
    // de negocio como Response 4xx, no como reject) o al menos una puede
    // ganar el P2034 retry-agotado — cualquiera de los dos casos es
    // aceptable siempre que la invariante de abajo se cumpla.
    const statuses = await Promise.all(
      results.map(async (r) => (r.status === 'fulfilled' ? r.value.status : null)),
    )
    const oks = statuses.filter((s) => s === 200)
    expect(oks.length).toBe(1)

    const enRuta = await testPrisma.embarque.findMany({
      where: { trabajadorId: trabajador.id, estado: 'EN_RUTA' },
    })
    expect(enRuta.length).toBe(1)

    const abiertos = await testPrisma.embarque.findMany({
      where: { trabajadorId: trabajador.id, estado: 'ABIERTO' },
    })
    expect(abiertos.length).toBe(1)

    // Cleanup
    await testPrisma.embarque.deleteMany({ where: { trabajadorId: trabajador.id } })
    await testPrisma.trabajador.delete({ where: { id: trabajador.id } })
  })
})
