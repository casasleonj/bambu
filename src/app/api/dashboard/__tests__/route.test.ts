import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  permission: vi.fn(),
  fetch: vi.fn(),
  adapt: vi.fn(),
}))
vi.mock('@/lib/auth-check', () => ({
  requireAuth: mocks.auth,
  requirePermission: mocks.permission,
}))
vi.mock('@/modules/dashboard', () => ({
  fetchCurrentDashboardData: mocks.fetch,
}))
vi.mock('@/modules/dashboard/presentation', () => ({
  toLegacyDashboardData: mocks.adapt,
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
import { GET } from '../route'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'u', role: 'ADMIN' } })
  mocks.permission.mockResolvedValue({ user: { id: 'u', role: 'ADMIN' } })
})
describe('GET dashboard: consulta autorizada, sin falsos ceros', () => {
  it('sesión inválida no consulta datos financieros', async () => {
    mocks.auth.mockResolvedValue(new Response(null, { status: 401 }))
    expect((await GET()).status).toBe(401)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('aplica la matriz de permisos vigente después de autenticar', async () => {
    mocks.permission.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await GET()).status).toBe(403)
    expect(mocks.permission).toHaveBeenCalledWith(
      'view:dashboard',
      expect.objectContaining({ user: { id: 'u', role: 'ADMIN' } }),
    )
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('devuelve una lectura privada, sin caché compartida', async () => {
    mocks.fetch.mockResolvedValue({ test: true })
    mocks.adapt.mockReturnValue({
      consultadoAt: '2026-10-29T15:00:00Z',
      ventas: 100000,
    })
    const r = await GET()
    expect(r.status).toBe(200)
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await r.json()).toMatchObject({
      success: true,
      dashboard: { ventas: 100000 },
    })
  })
  it('fallo de fuente da503, sin sustituir dinero desconocido por0', async () => {
    mocks.fetch.mockRejectedValue(new Error('fallo'))
    const r = await GET()
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ success: false })
    expect(mocks.adapt).not.toHaveBeenCalled()
  })
})
