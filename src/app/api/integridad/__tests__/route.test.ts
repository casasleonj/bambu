// @tests GET /api/integridad — solo ADMIN, devuelve el reporte sin escribir
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const requireAuth = vi.fn()
const requireRole = vi.fn()
const verificarIntegridad = vi.fn()

vi.mock('@/lib/auth-check', () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/integridad/verificar', () => ({
  verificarIntegridad: (...a: unknown[]) => verificarIntegridad(...a),
}))

const sesion = { user: { id: 'u1', role: 'ADMIN' } }

describe('GET /api/integridad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(sesion)
  })

  it('exige rol ADMIN', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN'], sesion)
    expect(verificarIntegridad).not.toHaveBeenCalled()
  })

  it('devuelve el reporte del verificador', async () => {
    requireRole.mockResolvedValue(sesion)
    const reporte = { generadoEn: 'x', resumen: { CRITICA: 0, ALTA: 1, MEDIA: 0, INFO: 0 }, reglas: [] }
    verificarIntegridad.mockResolvedValue(reporte)
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, reporte })
  })

  it('responde 500 si el verificador falla', async () => {
    requireRole.mockResolvedValue(sesion)
    verificarIntegridad.mockRejectedValue(new Error('boom'))
    const { GET } = await import('../route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
