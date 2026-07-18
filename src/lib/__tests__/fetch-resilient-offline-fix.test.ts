// @tests fetchResilient — fixes del bug "crear cliente se queda guardando"
// Cubren:
// 1. timeoutMs customizable (no hardcoded a 10s)
// 2. reason='timeout' vs reason='network' en resultado offline
// 3. timeout=60s no dispara antes de tiempo

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRequestQueueAdd = vi.fn().mockResolvedValue(undefined)
const mockRequestQueueCount = vi.fn().mockResolvedValue(0)
vi.mock('@/lib/db/offline', () => ({
  offlineDb: {
    requestQueue: {
      add: (...args: unknown[]) => mockRequestQueueAdd(...args),
      count: () => mockRequestQueueCount(),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

const { fetchResilient } = await import('@/lib/fetch-resilient')

describe('fetchResilient — fixes bug crear-cliente-lento', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockReset()
    mockRequestQueueAdd.mockReset()
    mockRequestQueueAdd.mockResolvedValue(undefined)
    mockRequestQueueCount.mockReset()
    mockRequestQueueCount.mockResolvedValue(0)
  })
  afterEach(() => vi.useRealTimers())

  it('acepta timeoutMs personalizado y no aborta antes de ese tiempo', async () => {
    // Simula fetch que se cuelga hasta el abort
    mockFetch.mockImplementationOnce(
      (_url, init: RequestInit | undefined) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
    )

    const promise = fetchResilient('/api/clientes', {
      method: 'POST',
      body: { nombre: 'QA' },
      localEndpoint: 'crear-cliente',
      timeoutMs: 60_000,
    })

    // Avanzar 10s (el viejo DEFAULT_TIMEOUT_MS): NO debe haber abortado
    await vi.advanceTimersByTimeAsync(10_500)
    // El fetch sigue colgado (no resolved)
    let resolved = false
    promise.then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBe(false)

    // Avanzar a 60s: ahora SÍ aborta
    await vi.advanceTimersByTimeAsync(50_000)
    const result = await promise

    expect(result.status).toBe('offline')
    if (result.status === 'offline') {
      expect(result.reason).toBe('timeout')
    }
  })

  it('distingue reason=network (TypeError) de reason=timeout (AbortError)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

    const result = await fetchResilient('/api/clientes', {
      method: 'POST',
      body: {},
      localEndpoint: 'crear-cliente',
    })

    expect(result.status).toBe('offline')
    if (result.status === 'offline') {
      expect(result.reason).toBe('network')
    }
  })

  it('distingue reason=timeout (AbortError) — caso default 10s', async () => {
    mockFetch.mockImplementationOnce(
      (_url, init: RequestInit | undefined) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
    )

    const promise = fetchResilient('/api/a', {
      method: 'POST',
      body: {},
      localEndpoint: 'a',
    })
    await vi.advanceTimersByTimeAsync(10_500)
    const result = await promise

    expect(result.status).toBe('offline')
    if (result.status === 'offline') {
      expect(result.reason).toBe('timeout')
    }
  })
})