// @tests POST /api/clientes — F1 Barrio canónico: comportamiento real
// (no solo estructura vía regex). Sigue el patrón ya establecido en
// src/app/api/pedidos/[id]/enviar/__tests__/race-condition.test.ts:
// mockear auth-check + la transacción, e invocar el handler real.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockBarrioFindUnique = vi.fn()
const mockClienteFindUnique = vi.fn()
const mockClienteFindFirst = vi.fn()
const mockClienteCreate = vi.fn()
const mockLogAudit = vi.fn().mockResolvedValue(undefined)
const mockPublishRealtimeEvent = vi.fn().mockResolvedValue(undefined)
const mockNotifyEvent = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'user_1', role: 'ADMIN' } }),
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'user_1', role: 'ADMIN' } }),
}))

vi.mock('@/lib/serializable', () => ({
  executeSerializableWithRetry: (fn: (tx: unknown) => unknown) =>
    fn({
      barrio: { findUnique: mockBarrioFindUnique },
      cliente: { findUnique: mockClienteFindUnique, findFirst: mockClienteFindFirst, create: mockClienteCreate },
    }),
}))

vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: mockPublishRealtimeEvent }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: mockNotifyEvent }))

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/clientes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/clientes — F1 Barrio canónico (comportamiento)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClienteFindUnique.mockResolvedValue(null)
    mockClienteFindFirst.mockResolvedValue(null)
  })

  it('crear Cliente con barrioId: persiste barrioId y barrio (=Barrio.nombre) consistentes', async () => {
    mockBarrioFindUnique.mockResolvedValue({ id: 'b1', nombre: 'La Esperanza', nombreNormalizado: 'la esperanza', activo: true })
    mockClienteCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'cli_1', ...data }),
    )

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ nombre: 'Juan', telefono: '3001234567', barrioId: 'b1' }))

    expect(res.status).toBe(201)
    const createCall = mockClienteCreate.mock.calls[0][0]
    // La invariante central del fix: si barrioId está presente, barrio
    // (string legacy) SIEMPRE es el nombre del Barrio resuelto — nunca
    // pueden divergir.
    expect(createCall.data.barrioId).toBe('b1')
    expect(createCall.data.barrio).toBe('La Esperanza')
  })

  it('barrioId inexistente: no crea el Cliente, responde 400', async () => {
    mockBarrioFindUnique.mockResolvedValue(null)

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ nombre: 'Juan', telefono: '3001234567', barrioId: 'no-existe' }))

    expect(res.status).toBe(400)
    const bodyRes = await res.json()
    expect(bodyRes.error?.message).toMatch(/barrio seleccionado no existe/)
    expect(mockClienteCreate).not.toHaveBeenCalled()
  })

  it('crear Cliente sin barrioId: no resuelve Barrio, persiste barrio legacy tal cual (compat)', async () => {
    mockClienteCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'cli_2', ...data }),
    )

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ nombre: 'Ana', telefono: '3009876543', barrio: 'Centro' }))

    expect(res.status).toBe(201)
    expect(mockBarrioFindUnique).not.toHaveBeenCalled()
    const createCall = mockClienteCreate.mock.calls[0][0]
    expect(createCall.data.barrio).toBe('Centro')
    expect(createCall.data.barrioId).toBeNull()
  })
})
