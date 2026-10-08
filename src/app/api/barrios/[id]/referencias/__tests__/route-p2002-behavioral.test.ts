// @tests POST /api/barrios/[id]/referencias — comportamiento real (no solo
// estructura vía regex) ante un P2002 real. Mismo bug y mismo fix que
// route-p2002-behavioral.test.ts de /alias — ver ese archivo para el detalle
// completo del bug real (instanceof vs. duck-typing).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockCrearReferencia = vi.fn()

vi.mock('@/lib/barrios/referencia-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/barrios/referencia-service')>(
    '@/lib/barrios/referencia-service',
  )
  return { ...actual, crearReferencia: mockCrearReferencia }
})

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } }),
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } }),
}))

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/barrios/b1/referencias', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/barrios/[id]/referencias — P2002 real (duck-typing, no instanceof)', () => {
  beforeEach(() => {
    mockCrearReferencia.mockReset()
  })

  it('un P2002 que NO es instanceof PrismaClientKnownRequestError igual se traduce a 409', async () => {
    const p2002Plano = { code: 'P2002', message: 'Unique constraint failed', meta: { target: ['barrioId', 'textoNormalizado'] } }
    mockCrearReferencia.mockRejectedValue(p2002Plano)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ texto: 'Antillana 1' }), { params: Promise.resolve({ id: 'b1' }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.message).toBe('Esa referencia ya está registrada para este barrio')
    expect(mockCrearReferencia).toHaveBeenCalledTimes(1)
  })

  it('un error realmente inesperado (sin .code) devuelve 500, no 409', async () => {
    mockCrearReferencia.mockRejectedValue(new Error('conexión perdida'))

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ texto: 'Cualquiera' }), { params: Promise.resolve({ id: 'b1' }) })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).not.toMatch(/ya está registrada/)
  })

  it('cuando no hay conflicto, crea normalmente', async () => {
    mockCrearReferencia.mockResolvedValue({ id: 'r1', barrioId: 'b1', texto: 'Antillana 1', textoNormalizado: 'antillana 1' })

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ texto: 'Antillana 1' }), { params: Promise.resolve({ id: 'b1' }) })

    expect(res.status).toBe(201)
    expect(mockCrearReferencia).toHaveBeenCalledTimes(1)
  })
})
