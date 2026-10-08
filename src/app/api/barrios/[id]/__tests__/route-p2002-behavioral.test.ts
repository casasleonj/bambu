// @tests PATCH /api/barrios/[id] — comportamiento real (no solo estructura
// vía regex) ante un P2002 real al renombrar.
//
// Mismo bug ya corregido en las rutas de alias/referencias (F4,
// 2026-10-07): `error instanceof PrismaClientKnownRequestError` evalúa
// `false` para un P2002 legítimo cuando el error del motor de Prisma y la
// clase importada en el route handler vienen de copias distintas del
// módulo `@prisma/client/runtime/library` (duplicación por bundling). Este
// test lanza, desde `renombrarBarrio` mockeado, un error PLANO (objeto
// literal con `.code = 'P2002'`) que deliberadamente NO es instancia de
// `PrismaClientKnownRequestError` — exactamente el caso real que el fix
// (`prismaErrorCode`, duck-typing) debe seguir detectando.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockRenombrarBarrio = vi.fn()

vi.mock('@/lib/barrios/barrio-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/barrios/barrio-service')>(
    '@/lib/barrios/barrio-service',
  )
  return { ...actual, renombrarBarrio: mockRenombrarBarrio }
})

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } }),
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    barrio: {
      findUnique: vi.fn().mockResolvedValue({ id: 'b1', nombre: 'La Antillana', activo: true }),
    },
  },
}))

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/barrios/b1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/barrios/[id] — P2002 real al renombrar (duck-typing, no instanceof)', () => {
  beforeEach(() => {
    mockRenombrarBarrio.mockReset()
  })

  it('un P2002 que NO es instanceof PrismaClientKnownRequestError igual se traduce a 409 "Ya existe un barrio con ese nombre"', async () => {
    const p2002Plano = { code: 'P2002', message: 'Unique constraint failed', meta: { target: ['nombreNormalizado'] } }
    mockRenombrarBarrio.mockRejectedValue(p2002Plano)

    const { PATCH } = await import('../route')
    const res = await PATCH(makeRequest({ nombre: 'El Cafetal' }), { params: Promise.resolve({ id: 'b1' }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('Ya existe un barrio con ese nombre')
    expect(mockRenombrarBarrio).toHaveBeenCalledTimes(1)
  })

  it('un error realmente inesperado (sin .code) devuelve 500, no 409 — no se confunde con P2002', async () => {
    mockRenombrarBarrio.mockRejectedValue(new Error('conexión perdida'))

    const { PATCH } = await import('../route')
    const res = await PATCH(makeRequest({ nombre: 'El Cafetal' }), { params: Promise.resolve({ id: 'b1' }) })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).not.toMatch(/ya existe/)
  })

  it('cuando no hay conflicto, renombra normalmente (el mock no interfiere con el camino feliz)', async () => {
    mockRenombrarBarrio.mockResolvedValue({
      barrio: { id: 'b1', nombre: 'El Cafetal', activo: true },
      clientesSincronizados: 0,
      negociosSincronizados: 0,
    })

    const { PATCH } = await import('../route')
    const res = await PATCH(makeRequest({ nombre: 'El Cafetal' }), { params: Promise.resolve({ id: 'b1' }) })

    expect(res.status).toBe(200)
    expect(mockRenombrarBarrio).toHaveBeenCalledTimes(1)
  })
})
