import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const createClientMock = vi.fn()
const publishMock = vi.fn()
const onMock = vi.fn()
const connectMock = vi.fn().mockResolvedValue(undefined)

vi.mock('redis', () => ({
  createClient: (...args: unknown[]) => {
    createClientMock(...args)
    return {
      on: onMock,
      connect: connectMock,
      publish: publishMock,
    }
  },
}))

describe('realtime publisher', () => {
  const originalRedisUrl = process.env.REDIS_URL

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.REDIS_URL = 'redis://localhost:6380'
  })

  afterEach(() => {
    process.env.REDIS_URL = originalRedisUrl
  })

  it('publishes a small JSON event to the configured Redis channel', async () => {
    const { publishRealtimeEvent, getRealtimeChannel } = await import('@/lib/realtime')

    await publishRealtimeEvent('pedido.created', 'pedido-123')

    expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({
      url: 'redis://localhost:6380',
      disableOfflineQueue: true,
    }))
    expect(publishMock).toHaveBeenCalledWith(
      getRealtimeChannel(),
      expect.stringMatching(/"type":"pedido\.created"/),
    )

    const publishedPayload = JSON.parse(publishMock.mock.calls[0][1])
    expect(publishedPayload).toMatchObject({
      type: 'pedido.created',
      id: 'pedido-123',
    })
    expect(typeof publishedPayload.timestamp).toBe('string')
  })

  it('reuses the same Redis publisher client across calls', async () => {
    const { publishRealtimeEvent } = await import('@/lib/realtime')

    await publishRealtimeEvent('cliente.created', 'cliente-1')
    await publishRealtimeEvent('cliente.updated', 'cliente-2')

    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(publishMock).toHaveBeenCalledTimes(2)
  })

  it('silently no-ops when REDIS_URL is not configured', async () => {
    delete process.env.REDIS_URL
    const { publishRealtimeEvent } = await import('@/lib/realtime')

    await expect(publishRealtimeEvent('pedido.created', 'pedido-123')).resolves.toBeUndefined()
    expect(createClientMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('survives publish errors without throwing', async () => {
    publishMock.mockRejectedValueOnce(new Error('Redis unavailable'))
    const { publishRealtimeEvent } = await import('@/lib/realtime')

    await expect(publishRealtimeEvent('pedido.created', 'pedido-123')).resolves.toBeUndefined()
  })
})
