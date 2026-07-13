import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithTimeout } from '../fetch-timeout'

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resuelve cuando fetch responde antes del timeout', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const res = await fetchWithTimeout('/api/test')
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('propaga errores de fetch que no sean AbortError', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

    await expect(fetchWithTimeout('/api/test')).rejects.toBeInstanceOf(TypeError)
  })
})
