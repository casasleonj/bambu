/**
 * Unit tests for GET /api/clientes/[id]/fiado-status
 *
 * Verifies:
 *   - Auth required (401)
 *   - Cliente not found (404)
 *   - Happy path returns FiadoStatus
 *   - Unexpected errors return 500
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockExecute = vi.fn()
const mockClienteNotFoundError = class extends Error {}

vi.mock('@/modules/pedidos', () => ({
  getFiadoStatusUseCase: { execute: (...args: unknown[]) => mockExecute(...args) },
  ClienteNotFoundError: mockClienteNotFoundError,
}))

vi.mock('@/lib/auth-check', () => ({
  requireAuth: async () => {
    if (!mockAuthSession) {
      return new Response('No autorizado', { status: 401 })
    }
    return mockAuthSession
  },
}))

vi.mock('@/lib/api-response', () => ({
  apiSuccess: (data: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify({ success: true, ...data }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  apiError: (msg: string, status = 400) =>
    new Response(JSON.stringify({ success: false, error: { message: msg } }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
}))

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

let mockAuthSession: { user: { id: string; role: string } } | null = {
  user: { id: 'u1', role: 'ADMIN' },
}

const { GET } = await import('@/app/api/clientes/[id]/fiado-status/route')

function makeRequest(clienteId: string): NextRequest {
  return new NextRequest(`http://localhost/api/clientes/${clienteId}/fiado-status`, {
    method: 'GET',
  })
}

describe('GET /api/clientes/[id]/fiado-status', () => {
  beforeEach(() => {
    mockExecute.mockReset()
    consoleErrorSpy.mockClear()
    mockAuthSession = { user: { id: 'u1', role: 'ADMIN' } }
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthSession = null
    const res = await GET(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when cliente is not found', async () => {
    mockExecute.mockRejectedValue(new mockClienteNotFoundError('not found'))
    const res = await GET(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.message).toMatch(/no encontrado/i)
  })

  it('returns ok status for a new cliente', async () => {
    mockExecute.mockResolvedValue({ count: 0, limite: 2, nivel: 'ok', pedidos: [] })
    const res = await GET(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.status).toEqual({ count: 0, limite: 2, nivel: 'ok', pedidos: [] })
  })

  it('returns limite status for a cliente with 2 fiados', async () => {
    mockExecute.mockResolvedValue({ count: 2, limite: 2, nivel: 'limite', pedidos: [] })
    const res = await GET(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status.nivel).toBe('limite')
  })

  it('returns 500 and logs error on unexpected failure', async () => {
    mockExecute.mockRejectedValue(new Error('boom'))
    const res = await GET(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(500)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
