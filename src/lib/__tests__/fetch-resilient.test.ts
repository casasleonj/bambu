/**
 * fetchResilient unit tests.
 *
 * Strategy: mock the global fetch, mock the Dexie queue (offlineDb),
 * verify the 3 status branches: ok / offline / error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the offline DB before importing the module under test
const mockRequestQueueAdd = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/db/offline', () => ({
  offlineDb: {
    requestQueue: {
      add: (...args: unknown[]) => mockRequestQueueAdd(...args),
    },
  },
}))

// Mock the logger to avoid pino-pretty in test output
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

// Import AFTER mocks
const { fetchResilient } = await import('@/lib/fetch-resilient')

describe('fetchResilient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockReset()
    mockRequestQueueAdd.mockReset()
    mockRequestQueueAdd.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns status=ok when server responds 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, pedido: { id: 'p1' } }),
    })

    const result = await fetchResilient<{ success: boolean; pedido: { id: string } }>(
      '/api/pedidos',
      { method: 'POST', body: { clienteId: 'c1' }, localEndpoint: 'crear-pedido' }
    )

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.data.pedido.id).toBe('p1')
      expect(result.statusCode).toBe(200)
    }
    expect(mockRequestQueueAdd).not.toHaveBeenCalled()
  })

  it('returns status=offline and enqueues when fetch throws TypeError (network down)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

    const result = await fetchResilient(
      '/api/pedidos',
      { method: 'POST', body: { clienteId: 'c1' }, localEndpoint: 'crear-pedido' }
    )

    expect(result.status).toBe('offline')
    if (result.status === 'offline') {
      expect(result.localId).toBeTruthy()
      expect(result.localId.length).toBeGreaterThan(0) // UUID
    }
    expect(mockRequestQueueAdd).toHaveBeenCalledTimes(1)
    const enqueuedArg = mockRequestQueueAdd.mock.calls[0]?.[0] as { url: string; method: string; offlineId: string }
    expect(enqueuedArg.url).toBe('/api/pedidos')
    expect(enqueuedArg.method).toBe('POST')
    expect(enqueuedArg.offlineId).toBeTruthy()
  })

  it('returns status=offline when fetch times out (AbortError)', async () => {
    mockFetch.mockImplementationOnce(
      (_url, init: RequestInit | undefined) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
    )

    const promise = fetchResilient(
      '/api/pedidos',
      { method: 'POST', body: {}, localEndpoint: 'crear-pedido' }
    )
    // Avanzamos el reloj para disparar el timeout (10s)
    await vi.advanceTimersByTimeAsync(10_500)
    const result = await promise

    expect(result.status).toBe('offline')
    expect(mockRequestQueueAdd).toHaveBeenCalledTimes(1)
  })

  it('returns status=error and does NOT enqueue when server responds 4xx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: { message: 'Cliente no existe' } }),
    })

    const result = await fetchResilient(
      '/api/pedidos',
      { method: 'POST', body: { clienteId: 'invalid' }, localEndpoint: 'crear-pedido' }
    )

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBe('Cliente no existe')
      expect(result.statusCode).toBe(400)
    }
    // 4xx = error de lógica, NO se reencola
    expect(mockRequestQueueAdd).not.toHaveBeenCalled()
  })

  it('returns status=error and does NOT enqueue when server responds 5xx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: { message: 'Internal server error' } }),
    })

    const result = await fetchResilient(
      '/api/pedidos',
      { method: 'POST', body: {}, localEndpoint: 'crear-pedido' }
    )

    expect(result.status).toBe('error')
    expect(mockRequestQueueAdd).not.toHaveBeenCalled()
  })

  it('generates unique localId for each offline enqueue', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    const r1 = await fetchResilient('/api/a', { method: 'POST', body: {}, localEndpoint: 'a' })
    const r2 = await fetchResilient('/api/b', { method: 'POST', body: {}, localEndpoint: 'b' })

    if (r1.status === 'offline' && r2.status === 'offline') {
      expect(r1.localId).not.toBe(r2.localId)
    } else {
      throw new Error('Expected both to be offline')
    }
  })
})
