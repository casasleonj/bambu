// @tests Fase R2 (hallazgo histórico: PR #140) — POST /api/clientes creaba
// el timer de 25s ANTES de validar el body. Una request inválida (400)
// retornaba de inmediato, pero el timer seguía vivo y disparaba su
// reject(DB_TIMEOUT) más tarde sobre una promesa que nadie esperaba más
// → unhandledRejection: DB_TIMEOUT. Invariante: un timeout pertenece al
// trabajo que protege (validar → crear timeout → ejecutar DB → cancelar
// siempre). Este archivo no toca Postgres: executeSerializableWithRetry
// está mockeado, así que corre en la suite unitaria normal (sin DB).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const authUser = { id: 'admin-1', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => ({})) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))

const executeSerializableWithRetryMock = vi.fn()
vi.mock('@/lib/serializable', () => ({
  executeSerializableWithRetry: executeSerializableWithRetryMock,
}))

function postReq(body: unknown) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

describe('R2 — lifecycle del timeout de 25s en POST /api/clientes', () => {
  let unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => { unhandled.push(reason) }

  beforeEach(() => {
    vi.useFakeTimers()
    unhandled = []
    process.on('unhandledRejection', onUnhandled)
    executeSerializableWithRetryMock.mockReset()
  })

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled)
    vi.useRealTimers()
  })

  it('Caso A: body inválido → 400 inmediato, y NO queda ningún timer vivo (sin unhandledRejection 25s después)', async () => {
    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(postReq({ nombre: '' })) // nombre vacío → Zod rechaza
    expect(res.status).toBe(400)
    expect(executeSerializableWithRetryMock).not.toHaveBeenCalled()

    // Avanzar 30s: si el timer se creó antes de validar (código viejo),
    // su reject(DB_TIMEOUT) dispara ahora sin que nadie lo espere.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(unhandled).toEqual([])
  })

  it('Caso B: operación exitosa → el timeout queda cancelado (no dispara tras completarse la request)', async () => {
    executeSerializableWithRetryMock.mockResolvedValue({
      kind: 'created',
      cliente: { id: 'c1', nombre: 'Test', telefono: '3001234567', clienteId: 'c1', barrioId: null },
    })
    const { POST } = await import('@/app/api/clientes/route')
    const res = await POST(postReq({ nombre: 'Test', telefono: '3001234567' }))
    expect(res.status).toBe(201)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(unhandled).toEqual([])
  })

  it('Caso C: la DB real excede el timeout → respuesta controlada 500 DB_TIMEOUT (no cuelga)', async () => {
    // executeSerializableWithRetry nunca resuelve dentro de la ventana del test.
    executeSerializableWithRetryMock.mockImplementation(() => new Promise(() => {}))
    const { POST } = await import('@/app/api/clientes/route')
    const pending = POST(postReq({ nombre: 'Test', telefono: '3001234567' }))

    await vi.advanceTimersByTimeAsync(25_000)
    const res = await pending
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(JSON.stringify(body)).toMatch(/tardó demasiado/)
  })
})
