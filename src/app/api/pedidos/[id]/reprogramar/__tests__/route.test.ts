import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const execute = vi.fn()
const requireRole = vi.fn()
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 'u1' } })),
  requireRole: (...a: unknown[]) => requireRole(...a),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/modules/pedidos/application/use-cases/ReprogramarPedidoUseCase', async (orig) => {
  const real = await orig<typeof import('@/modules/pedidos/application/use-cases/ReprogramarPedidoUseCase')>()
  return { ...real, ReprogramarPedidoUseCase: class { execute = execute } }
})

import { POST } from '../route'
import { PedidoFechaCambioConcurrenteError } from '@/modules/pedidos/application/use-cases/ReprogramarPedidoUseCase'

const ctx = { params: Promise.resolve({ id: 'p1' }) }
const req = (body: unknown) => new NextRequest('http://x/api/pedidos/p1/reprogramar', { method: 'POST', body: JSON.stringify(body) })
const valido = { fechaNueva: '2026-11-19T17:00:00.000Z' }

describe('POST /api/pedidos/[id]/reprogramar (#836 F1)', () => {
  beforeEach(() => {
    execute.mockReset()
    requireRole.mockReset().mockResolvedValue({ user: { id: 'u1' } })
  })

  it('rol no permitido → responde la negativa del guard y no ejecuta nada', async () => {
    requireRole.mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 403 }))
    const res = await POST(req(valido), ctx)
    expect(res.status).toBe(403)
    expect(execute).not.toHaveBeenCalled()
    expect(requireRole.mock.calls[0][0]).toEqual(['ADMIN', 'ASISTENTE'])
  })

  it('cuerpo inválido → 400', async () => {
    expect((await POST(req({ fechaNueva: 'mañana' }), ctx)).status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it('éxito → 201; reintento deduplicado → 200', async () => {
    execute.mockResolvedValueOnce({ deduped: false }).mockResolvedValueOnce({ deduped: true })
    expect((await POST(req(valido), ctx)).status).toBe(201)
    expect((await POST(req(valido), ctx)).status).toBe(200)
  })

  it('pasa la fecha esperada (incluido null = «sin fecha») al caso de uso', async () => {
    execute.mockResolvedValue({ deduped: false })
    await POST(req({ ...valido, fechaAnteriorEsperada: null }), ctx)
    expect(execute.mock.calls[0][0].fechaAnteriorEsperada).toBeNull()
    await POST(req(valido), ctx)
    expect(execute.mock.calls[1][0].fechaAnteriorEsperada).toBeUndefined()
  })

  it('conflicto de edición → 409; no reprogramable → 409; inexistente → 404; otro error → 500', async () => {
    execute.mockRejectedValueOnce(new PedidoFechaCambioConcurrenteError(null))
    expect((await POST(req(valido), ctx)).status).toBe(409)
    execute.mockRejectedValueOnce(new Error('PEDIDO_NO_REPROGRAMABLE: estado actual ENTREGADO'))
    expect((await POST(req(valido), ctx)).status).toBe(409)
    execute.mockRejectedValueOnce(new Error('PEDIDO_NOT_FOUND: p1'))
    expect((await POST(req(valido), ctx)).status).toBe(404)
    execute.mockRejectedValueOnce(new Error('boom'))
    expect((await POST(req(valido), ctx)).status).toBe(500)
  })
})
