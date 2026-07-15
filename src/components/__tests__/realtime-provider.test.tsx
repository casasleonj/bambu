import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { RealtimeProvider } from '@/components/realtime-provider'

const instances: MockEventSource[] = []

class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onconnected: ((e: MessageEvent) => void) | null = null
  onrateLimited: ((e: MessageEvent) => void) | null = null
  close = vi.fn()
  addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
    if (event === 'connected') this.onconnected = handler
    if (event === 'message') this.onmessage = handler
    if (event === 'error') this.onerror = handler as () => void
    if (event === 'rate_limited') this.onrateLimited = handler
  })
  removeEventListener = vi.fn()

  constructor(_url: string) {
    instances.push(this)
  }

  static get instances() {
    return instances
  }

  static reset() {
    instances.forEach((i) => i.close())
    instances.length = 0
  }
}

function installMock() {
  MockEventSource.reset()
  // @ts-expect-error jsdom does not provide EventSource.
  globalThis.EventSource = MockEventSource
}

function uninstallMock() {
  MockEventSource.reset()
  // @ts-expect-error restore missing global.
  globalThis.EventSource = undefined
}

// Keep a live mock on the global to avoid interleaving issues between suites.
installMock()

function renderProvider() {
  return render(
    <RealtimeProvider>
      <div />
    </RealtimeProvider>,
  )
}

function getLatestInstance() {
  return MockEventSource.instances[MockEventSource.instances.length - 1]
}

async function flushInitialConnect() {
  await act(async () => {
    vi.advanceTimersByTime(0)
  })
}

describe('RealtimeProvider rate_limited handling', () => {
  beforeEach(() => {
    installMock()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    uninstallMock()
  })

  it('backs off after a rate_limited event and reconnects after retryAfter', async () => {
    renderProvider()
    await flushInitialConnect()

    const es = getLatestInstance()
    expect(es).toBeDefined()

    await act(async () => {
      es.onrateLimited?.(new MessageEvent('rate_limited', { data: JSON.stringify({ retryAfter: 2 }) }))
    })

    // Connection should be closed immediately.
    expect(es.close).toHaveBeenCalled()

    // Before retryAfter expires no new connection is attempted.
    await act(async () => vi.advanceTimersByTime(1_900))
    expect(MockEventSource.instances.length).toBe(1)

    // After retryAfter expires provider reconnects.
    await act(async () => vi.advanceTimersByTime(1_500))
    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2)
  })

  it('disables SSE for the cooldown period after 3 rate_limited events within the window', async () => {
    renderProvider()
    await flushInitialConnect()

    for (let i = 0; i < 3; i++) {
      const es = getLatestInstance()
      await act(async () => {
        es.onrateLimited?.(new MessageEvent('rate_limited', { data: JSON.stringify({ retryAfter: 1 }) }))
      })
      await act(async () => vi.advanceTimersByTime(100))
    }

    // Only the initial connection was ever opened; the scheduled reconnects
    // during the 5-minute cooldown are blocked.
    expect(MockEventSource.instances.length).toBe(1)

    // Even well after the short retryAfter, no new SSE connection is attempted
    // because the 5-minute cooldown is active.
    await act(async () => vi.advanceTimersByTime(120_000))
    expect(MockEventSource.instances.length).toBe(1)
  })

  it('resets rate-limit counters after a successful connected event', async () => {
    renderProvider()
    await flushInitialConnect()

    const es1 = getLatestInstance()
    await act(async () => {
      es1.onrateLimited?.(new MessageEvent('rate_limited', { data: JSON.stringify({ retryAfter: 1 }) }))
    })

    // Reconnect after retryAfter.
    await act(async () => vi.advanceTimersByTime(1_500))
    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2)

    const es2 = getLatestInstance()
    await act(async () => {
      es2.onconnected?.(new MessageEvent('connected', { data: '{}' }))
    })

    // A new rate_limited event should not immediately trigger the 5-minute cooldown.
    await act(async () => {
      es2.onrateLimited?.(new MessageEvent('rate_limited', { data: JSON.stringify({ retryAfter: 1 }) }))
    })

    await act(async () => vi.advanceTimersByTime(1_500))
    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(3)
  })

  it('applies jitter to retry delays', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    renderProvider()
    await flushInitialConnect()

    const es = getLatestInstance()
    await act(async () => {
      es.onerror?.()
    })

    // Base delay is 5s; jitter 0.5 -> 5s * 1.15 = 5750ms.
    await act(async () => vi.advanceTimersByTime(5_000))
    expect(MockEventSource.instances.length).toBe(1)

    await act(async () => vi.advanceTimersByTime(1_000))
    expect(MockEventSource.instances.length).toBe(2)

    randomSpy.mockRestore()
  })

  it('deduplicates rapid error events', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    renderProvider()
    await flushInitialConnect()

    const es = getLatestInstance()
    await act(async () => {
      es.onerror?.()
      es.onerror?.()
      es.onerror?.()
    })

    // Only one retry should be scheduled; with zero jitter first retry is at 5s.
    await act(async () => vi.advanceTimersByTime(5_000))
    expect(MockEventSource.instances.length).toBe(2)

    randomSpy.mockRestore()
  })
})
