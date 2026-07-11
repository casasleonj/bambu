/**
 * Tests for the auth-expired detection in fetchResilient.
 *
 * When the server responds 401/403, fetchResilient must dispatch the
 * app:auth:expired event so SessionExpiryGuard can redirect to /login.
 * Internal Auth.js endpoints are excluded because the SessionProvider already
 * handles session state changes via its own polling.
 */

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
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')

describe('fetchResilient auth error dispatching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    mockRequestQueueAdd.mockReset()
    mockRequestQueueAdd.mockResolvedValue(undefined)
    mockRequestQueueCount.mockReset()
    mockRequestQueueCount.mockResolvedValue(0)
    dispatchEventSpy.mockReset()
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_USE_RESILIENT_FETCH
  })

  it('dispatches app:auth:expired on 401', async () => {
    const { fetchResilient } = await import('@/lib/fetch-resilient')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'No autorizado' } }),
    })

    await fetchResilient('/api/pedidos', { method: 'POST', body: {}, localEndpoint: 'crear-pedido' })

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1)
    const event = dispatchEventSpy.mock.calls[0]?.[0] as CustomEvent
    expect(event.type).toBe('app:auth:expired')
    expect(event.detail).toEqual({ statusCode: 401, url: '/api/pedidos' })
  })

  it('dispatches app:auth:expired on 403', async () => {
    const { fetchResilient } = await import('@/lib/fetch-resilient')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Forbidden' } }),
    })

    await fetchResilient('/api/pedidos', { method: 'POST', body: {}, localEndpoint: 'crear-pedido' })

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1)
    const event = dispatchEventSpy.mock.calls[0]?.[0] as CustomEvent
    expect(event.type).toBe('app:auth:expired')
    expect(event.detail.statusCode).toBe(403)
  })

  it('does NOT dispatch for /api/auth/* endpoints', async () => {
    const { fetchResilient } = await import('@/lib/fetch-resilient')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Session expired' } }),
    })

    await fetchResilient('/api/auth/signin', { method: 'POST', body: {}, localEndpoint: 'signin' })

    expect(dispatchEventSpy).not.toHaveBeenCalled()
  })

  it('does NOT dispatch on 200', async () => {
    const { fetchResilient } = await import('@/lib/fetch-resilient')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    })

    await fetchResilient('/api/pedidos', { method: 'POST', body: {}, localEndpoint: 'crear-pedido' })

    expect(dispatchEventSpy).not.toHaveBeenCalled()
  })

  it('does NOT dispatch on 500', async () => {
    const { fetchResilient } = await import('@/lib/fetch-resilient')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal server error' } }),
    })

    await fetchResilient('/api/pedidos', { method: 'POST', body: {}, localEndpoint: 'crear-pedido' })

    expect(dispatchEventSpy).not.toHaveBeenCalled()
  })

  it('fetchDirect path also dispatches app:auth:expired on 401 when feature flag is off', async () => {
    process.env.NEXT_PUBLIC_USE_RESILIENT_FETCH = 'false'
    const { fetchResilient } = await import('@/lib/fetch-resilient')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'No autorizado' } }),
    })

    await fetchResilient('/api/pedidos', { method: 'POST', body: {}, localEndpoint: 'crear-pedido' })

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1)
    const event = dispatchEventSpy.mock.calls[0]?.[0] as CustomEvent
    expect(event.type).toBe('app:auth:expired')
    expect(event.detail.statusCode).toBe(401)
  })
})
