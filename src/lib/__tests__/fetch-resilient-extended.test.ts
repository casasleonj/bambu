// @tests fetchResilient — comportamiento offline-first, encolado, dedup
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { offlineDb } from '@/lib/db/offline'

// Mock global fetch
beforeEach(() => {
  vi.restoreAllMocks()
  // Limpiar queue entre tests
  vi.spyOn(offlineDb.requestQueue, 'count').mockResolvedValue(0)
  vi.spyOn(offlineDb.requestQueue, 'add').mockResolvedValue(undefined as any)
})

describe('fetchResilient — comportamiento offline', () => {
  it('encola request cuando hay TypeError (network down)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    const { fetchResilient } = await import('@/lib/fetch-resilient')
    const result = await fetchResilient('/api/pedidos', {
      method: 'POST',
      body: { clienteId: 'c1', items: [] },
      localEndpoint: 'test',
    })

    expect(result.status).toBe('offline')
    expect(offlineDb.requestQueue.add).toHaveBeenCalled()
  })

  it('retorna ok cuando fetch tiene éxito', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'success' }),
    } as any)

    const { fetchResilient } = await import('@/lib/fetch-resilient')
    const result = await fetchResilient('/api/pedidos', {
      method: 'POST',
      body: { clienteId: 'c1' },
      localEndpoint: 'test',
    })

    expect(result.status).toBe('ok')
  })

  it('retorna error (no encola) cuando server retorna 4xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad Request' }),
    } as any)

    const { fetchResilient } = await import('@/lib/fetch-resilient')
    const result = await fetchResilient('/api/pedidos', {
      method: 'POST',
      body: { clienteId: 'c1' },
      localEndpoint: 'test',
    })

    expect(result.status).toBe('error')
    expect(offlineDb.requestQueue.add).not.toHaveBeenCalled()
  })

  it('preserva offlineId del body para dedup correcto', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    } as any)

    const { fetchResilient } = await import('@/lib/fetch-resilient')
    const myOfflineId = 'test-offline-id-123'

    await fetchResilient('/api/pedidos', {
      method: 'POST',
      body: { clienteId: 'c1', offlineId: myOfflineId },
      localEndpoint: 'test',
    })

    // El body enviado al server debe incluir el offlineId
    const fetchMock = global.fetch as any
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sentBody.offlineId).toBe(myOfflineId)
  })
})
