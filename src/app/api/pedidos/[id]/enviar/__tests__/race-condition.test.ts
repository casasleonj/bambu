/**
 * BAMBU-LOG-003: race entre dos requests concurrentes asignando el MISMO
 * pedido a embarques distintos. Antes del fix, el `update` final no tenía
 * guarda condicional — el segundo request sobrescribía silenciosamente el
 * `embarqueId` del primero sin error, aunque ambos hubieran pasado el
 * check `if (current.embarqueId) throw ...` (leído antes de que cualquiera
 * comiteara).
 *
 * Este test no reproduce concurrencia real (requeriría dos transacciones
 * Postgres genuinas, no disponible en este entorno de test), pero prueba
 * el contrato del fix: si el `updateMany` con guarda `embarqueId: null`
 * afecta 0 filas (exactamente lo que pasaría si otra transacción ganó la
 * carrera), la request debe fallar con PEDIDO_YA_ASIGNADO en vez de
 * responder éxito.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockPedidoFindUnique = vi.fn()
const mockPedidoUpdateMany = vi.fn()
const mockEmbarqueFindUnique = vi.fn()
const mockEmbarqueUpdate = vi.fn()
const mockTrabajadorFindUnique = vi.fn()
const mockLogAudit = vi.fn()
const mockPublishRealtimeEvent = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'user_1', role: 'ADMIN' } }),
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'user_1', role: 'ADMIN' } }),
  requireOwnership: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        pedido: { findUnique: mockPedidoFindUnique, updateMany: mockPedidoUpdateMany },
        embarque: { findUnique: mockEmbarqueFindUnique, update: mockEmbarqueUpdate },
        trabajador: { findUnique: mockTrabajadorFindUnique },
      }),
  },
}))

vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: mockPublishRealtimeEvent }))

function makePedidoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ped_1',
    estado: 'PENDIENTE',
    embarqueId: null,
    estadoEntrega: 'PENDIENTE',
    envioOfflineId: null,
    numero: 10,
    cPacaAguaPed: 1,
    cPacaHieloPed: 0,
    cBotellonFabPed: 0,
    cBotellonDomPed: 0,
    cBolsaAguaPed: 0,
    cBolsaHieloPed: 0,
    ...overrides,
  }
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/pedidos/ped_1/enviar', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/pedidos/[id]/enviar — BAMBU-LOG-003', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPedidoFindUnique.mockResolvedValue(makePedidoRow())
    mockEmbarqueFindUnique.mockResolvedValue({
      id: 'emb_1',
      trabajadorId: 'trab_1',
      estado: 'ABIERTO',
      pedidos: [],
    })
    mockTrabajadorFindUnique.mockResolvedValue({ capacidadKg: 500 })
    mockEmbarqueUpdate.mockResolvedValue({})
    mockPublishRealtimeEvent.mockResolvedValue(undefined)
  })

  it('camino normal (sin race): updateMany afecta 1 fila, responde 201', async () => {
    mockPedidoUpdateMany.mockResolvedValue({ count: 1 })

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ embarqueId: 'emb_1' }), { params: Promise.resolve({ id: 'ped_1' }) })

    expect(res.status).toBe(201)
    expect(mockPedidoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ped_1', embarqueId: null } }),
    )
  })

  it('FIX BAMBU-LOG-009: al asignar el pedido, invalida ordenVisita/optimizadoEn del embarque', async () => {
    mockPedidoUpdateMany.mockResolvedValue({ count: 1 })

    const { POST } = await import('../route')
    await POST(makeRequest({ embarqueId: 'emb_1' }), { params: Promise.resolve({ id: 'ped_1' }) })

    expect(mockEmbarqueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'emb_1' },
        data: expect.objectContaining({ optimizadoEn: null }),
      }),
    )
  })

  it('FIX BAMBU-LOG-003: race ganada por otra transacción (updateMany count=0) responde 409, NO 201', async () => {
    // Simula: otra transacción ya asignó el pedido entre el findUnique
    // (que todavía leyó embarqueId: null) y este updateMany.
    mockPedidoUpdateMany.mockResolvedValue({ count: 0 })

    const { POST } = await import('../route')
    const res = await POST(makeRequest({ embarqueId: 'emb_1' }), { params: Promise.resolve({ id: 'ped_1' }) })

    expect(res.status).not.toBe(201)
    // F6: conflicto de asignación por concurrencia → 409 (unificado con PUT /api/embarques/[id]).
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error?.message ?? JSON.stringify(body)).toMatch(/ya está asignado/i)
  })
})
