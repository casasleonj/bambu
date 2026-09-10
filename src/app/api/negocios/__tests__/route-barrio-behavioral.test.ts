// @tests POST /api/negocios — F1-CONCURRENCIA (fix revisión pre-merge)
// Prueba el comportamiento real: verificar cliente + resolver Barrio +
// crear Negocio ocurren dentro de LA MISMA transacción, así que
// barrioId/barrio nunca pueden quedar desincronizados por una carrera con
// un rename concurrente del Barrio.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockClienteFindUnique = vi.fn()
const mockBarrioFindUnique = vi.fn()
const mockNegocioCreate = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'user_1', role: 'ADMIN' } }),
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'user_1', role: 'ADMIN' } }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        cliente: { findUnique: mockClienteFindUnique },
        barrio: { findUnique: mockBarrioFindUnique },
        negocio: { create: mockNegocioCreate },
      }),
  },
}))

vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/negocios', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/negocios — F1-CONCURRENCIA (comportamiento)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClienteFindUnique.mockResolvedValue({ id: 'cli_1' })
  })

  it('crear Negocio con barrioId: barrioId y barrio quedan consistentes en el MISMO create', async () => {
    mockBarrioFindUnique.mockResolvedValue({ id: 'b1', nombre: 'La Esperanza', nombreNormalizado: 'la esperanza', activo: true })
    mockNegocioCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'neg_1', ...data }),
    )

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ clienteId: 'cli_1', nombre: 'Tienda X', barrioId: 'b1' }))

    expect(res.status).toBe(200)
    const createCall = mockNegocioCreate.mock.calls[0][0]
    expect(createCall.data.barrioId).toBe('b1')
    expect(createCall.data.barrio).toBe('La Esperanza')
  })

  it('barrioId inexistente: NO crea el Negocio, responde 400', async () => {
    mockBarrioFindUnique.mockResolvedValue(null)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ clienteId: 'cli_1', nombre: 'Tienda X', barrioId: 'fantasma' }))

    expect(res.status).toBe(400)
    const bodyRes = await res.json()
    expect(bodyRes.error?.message).toMatch(/barrio seleccionado no existe/)
    expect(mockNegocioCreate).not.toHaveBeenCalled()
  })

  it('clienteId inexistente: aborta antes de resolver el Barrio o crear el Negocio', async () => {
    mockClienteFindUnique.mockResolvedValue(null)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ clienteId: 'no-existe', nombre: 'Tienda X', barrioId: 'b1' }))

    expect(res.status).toBe(404)
    expect(mockBarrioFindUnique).not.toHaveBeenCalled()
    expect(mockNegocioCreate).not.toHaveBeenCalled()
  })

  it('crear Negocio sin barrioId: no resuelve Barrio, persiste barrio legacy tal cual (compat)', async () => {
    mockNegocioCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'neg_2', ...data }),
    )

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ clienteId: 'cli_1', nombre: 'Tienda Y', barrio: 'Centro' }))

    expect(res.status).toBe(200)
    expect(mockBarrioFindUnique).not.toHaveBeenCalled()
    const createCall = mockNegocioCreate.mock.calls[0][0]
    expect(createCall.data.barrio).toBe('Centro')
  })
})
