// @tests PUT /api/clientes/[id] — F1-CONCURRENCIA (fix revisión pre-merge)
// Prueba el comportamiento real del fix, no solo su estructura: la
// resolución del Barrio y la persistencia de barrioId+barrio ocurren
// dentro de LA MISMA llamada a prisma.$transaction — nunca puede haber
// una escritura con barrioId sin su barrio legacy sincronizado.
// Sigue el patrón ya establecido en
// src/app/api/pedidos/[id]/enviar/__tests__/race-condition.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockClienteFindUnique = vi.fn()
const mockClienteUpdateMany = vi.fn()
const mockBarrioFindUnique = vi.fn()
const mockLogAudit = vi.fn().mockResolvedValue(undefined)
const mockPublishRealtimeEvent = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'user_1', role: 'ADMIN' } }),
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'user_1', role: 'ADMIN' } }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        cliente: { findUnique: mockClienteFindUnique, updateMany: mockClienteUpdateMany },
        barrio: { findUnique: mockBarrioFindUnique },
      }),
  },
}))

vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: mockPublishRealtimeEvent }))

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/clientes/cli_1', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('PUT /api/clientes/[id] — F1-CONCURRENCIA (comportamiento)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('vincular barrioId a un registro legacy: barrioId y barrio quedan consistentes en el MISMO updateMany', async () => {
    mockClienteFindUnique
      .mockResolvedValueOnce({ updatedAt: new Date('2026-01-01'), barrioId: null }) // existing (legacy, sin vincular)
      .mockResolvedValueOnce({ id: 'cli_1', barrio: 'La Esperanza', barrioId: 'b1', contactos: [] }) // re-read final
    mockBarrioFindUnique.mockResolvedValue({ id: 'b1', nombre: 'La Esperanza', nombreNormalizado: 'la esperanza', activo: true })
    mockClienteUpdateMany.mockResolvedValue({ count: 1 })

    const { PUT } = await import('../route')
    const res = await PUT(makeRequest({ barrioId: 'b1' }), { params: Promise.resolve({ id: 'cli_1' }) })

    expect(res.status).toBe(200)
    const updateCall = mockClienteUpdateMany.mock.calls[0][0]
    // La invariante central: la data persistida NUNCA tiene barrioId sin
    // su barrio correspondiente ya resuelto — ambos vienen del MISMO
    // objeto Barrio leído dentro de esta transacción.
    expect(updateCall.data.barrioId).toBe('b1')
    expect(updateCall.data.barrio).toBe('La Esperanza')

    // Vinculación de un registro legacy (no tenía barrioId antes) → audita
    // el evento aparte, además del UPDATE genérico.
    const vinculoCall = mockLogAudit.mock.calls.find(
      (call) => (call[0].datos as Record<string, unknown>)?.vinculoBarrio,
    )
    expect(vinculoCall).toBeDefined()
  })

  it('barrioId inexistente: NO llama updateMany (la transacción aborta antes de escribir), responde 400', async () => {
    mockClienteFindUnique.mockResolvedValueOnce({ updatedAt: new Date('2026-01-01'), barrioId: null })
    mockBarrioFindUnique.mockResolvedValue(null)

    const { PUT } = await import('../route')
    const res = await PUT(makeRequest({ barrioId: 'fantasma' }), { params: Promise.resolve({ id: 'cli_1' }) })

    expect(res.status).toBe(400)
    const bodyRes = await res.json()
    expect(bodyRes.error?.message).toMatch(/barrio seleccionado no existe/)
    expect(mockClienteUpdateMany).not.toHaveBeenCalled()
  })

  it('re-confirmar un barrioId ya vinculado NO genera un segundo evento de vinculación', async () => {
    mockClienteFindUnique
      .mockResolvedValueOnce({ updatedAt: new Date('2026-01-01'), barrioId: 'b1' }) // ya vinculado
      .mockResolvedValueOnce({ id: 'cli_1', barrio: 'La Esperanza', barrioId: 'b1', contactos: [] })
    mockBarrioFindUnique.mockResolvedValue({ id: 'b1', nombre: 'La Esperanza', nombreNormalizado: 'la esperanza', activo: true })
    mockClienteUpdateMany.mockResolvedValue({ count: 1 })

    const { PUT } = await import('../route')
    await PUT(makeRequest({ barrioId: 'b1' }), { params: Promise.resolve({ id: 'cli_1' }) })

    const vinculoCall = mockLogAudit.mock.calls.find(
      (call) => (call[0].datos as Record<string, unknown>)?.vinculoBarrio,
    )
    expect(vinculoCall).toBeUndefined()
  })

  it('conflicto de optimistic lock (otro admin editó primero): responde 409, no persiste barrioId a medias', async () => {
    mockClienteFindUnique.mockResolvedValueOnce({ updatedAt: new Date('2026-01-01'), barrioId: null })
    mockBarrioFindUnique.mockResolvedValue({ id: 'b1', nombre: 'La Esperanza', nombreNormalizado: 'la esperanza', activo: true })
    mockClienteUpdateMany.mockResolvedValue({ count: 0 })

    const { PUT } = await import('../route')
    const res = await PUT(makeRequest({ barrioId: 'b1' }), { params: Promise.resolve({ id: 'cli_1' }) })

    expect(res.status).toBe(409)
  })
})
