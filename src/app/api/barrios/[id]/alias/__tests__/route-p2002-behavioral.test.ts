// @tests POST /api/barrios/[id]/alias — comportamiento real (no solo
// estructura vía regex) ante un P2002 real.
//
// Bug detectado en el gate E2E contra Postgres real (F4, 2026-10-07): el
// bloqueo duro de Alias contra otro Barrio nunca se mostraba porque
// `error instanceof PrismaClientKnownRequestError` evaluaba `false` para un
// P2002 legítimo — el error que lanza el motor de Prisma en runtime real y
// la clase importada en el route handler pueden venir de copias distintas
// del módulo `@prisma/client/runtime/library` (duplicación por bundling).
// Los tests estructurales de `route.test.ts` nunca pudieron atrapar esto
// porque solo verifican que la palabra "P2002" aparezca en el código fuente.
//
// Este test lanza, desde `crearAlias` mockeado, un error PLANO (objeto
// literal con `.code = 'P2002'`) que deliberadamente NO es una instancia de
// `PrismaClientKnownRequestError` — exactamente el caso real que el fix
// (`prismaErrorCode`, duck-typing) debe seguir detectando.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockCrearAlias = vi.fn()

vi.mock('@/lib/barrios/referencia-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/barrios/referencia-service')>(
    '@/lib/barrios/referencia-service',
  )
  return { ...actual, crearAlias: mockCrearAlias }
})

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } }),
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } }),
}))

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/barrios/b2/alias', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/barrios/[id]/alias — P2002 real (duck-typing, no instanceof)', () => {
  beforeEach(() => {
    mockCrearAlias.mockReset()
  })

  it('un P2002 que NO es instanceof PrismaClientKnownRequestError igual se traduce a 409 "Ese alias ya está en uso"', async () => {
    // Objeto plano, deliberadamente sin prototipo de PrismaClientKnownRequestError —
    // reproduce el caso real donde instanceof falla pero .code sigue siendo correcto.
    const p2002Plano = { code: 'P2002', message: 'Unique constraint failed', meta: { target: ['textoNormalizado'] } }
    mockCrearAlias.mockRejectedValue(p2002Plano)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ texto: 'Antillana' }), { params: Promise.resolve({ id: 'b2' }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('Ese alias ya está en uso')
    expect(mockCrearAlias).toHaveBeenCalledTimes(1)
  })

  it('un error realmente inesperado (sin .code) devuelve 500, no 409 — no se confunde con P2002', async () => {
    mockCrearAlias.mockRejectedValue(new Error('conexión perdida'))

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ texto: 'Cualquiera' }), { params: Promise.resolve({ id: 'b2' }) })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).not.toMatch(/ya está en uso/)
  })

  it('cuando no hay conflicto, crea normalmente (el mock no interfiere con el camino feliz)', async () => {
    mockCrearAlias.mockResolvedValue({ id: 'a1', barrioId: 'b2', texto: 'Antillana', textoNormalizado: 'antillana' })

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ texto: 'Antillana' }), { params: Promise.resolve({ id: 'b2' }) })

    expect(res.status).toBe(201)
    expect(mockCrearAlias).toHaveBeenCalledTimes(1)
  })
})
