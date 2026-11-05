import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  permission: vi.fn(),
  contar: vi.fn(),
}))
vi.mock('@/lib/auth-check', () => ({
  requireAuth: mocks.auth,
  requirePermission: mocks.permission,
}))
vi.mock('@/lib/entregas-hoy', () => ({ contarEntregasDelDia: mocks.contar }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
import { GET } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'u', role: 'ADMIN' } })
  mocks.permission.mockResolvedValue({ user: { id: 'u', role: 'ADMIN' } })
})

describe('GET /api/dashboard/entregas-hoy', () => {
  it('sin sesión no consulta datos', async () => {
    mocks.auth.mockResolvedValue(new Response(null, { status: 401 }))
    expect((await GET()).status).toBe(401)
    expect(mocks.contar).not.toHaveBeenCalled()
  })

  it('sin permiso de dashboard no consulta datos', async () => {
    mocks.permission.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await GET()).status).toBe(403)
    expect(mocks.contar).not.toHaveBeenCalled()
  })

  it('devuelve el conteo sin caché y con un rango de 24 h', async () => {
    mocks.contar.mockResolvedValue({ total: 5, deHoy: 3, deDiasAnteriores: 2 })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await res.json()).entregas).toEqual({
      total: 5,
      deHoy: 3,
      deDiasAnteriores: 2,
    })
    const { start, end } = mocks.contar.mock.calls[0][0]
    expect(+end - +start).toBe(86_400_000)
  })

  it('un error de lectura responde 503, nunca ceros', async () => {
    mocks.contar.mockRejectedValue(new Error('db'))
    const res = await GET()
    expect(res.status).toBe(503)
    expect((await res.json()).entregas).toBeUndefined()
  })
})
