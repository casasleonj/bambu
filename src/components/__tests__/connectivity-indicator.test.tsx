import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { RealtimeProvider, useRealtime } from '@/components/realtime-provider'
import { ConnectivityIndicator } from '@/components/connectivity-indicator'

const instances: MockEventSource[] = []

class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onconnected: ((e: MessageEvent) => void) | null = null
  close = vi.fn()
  addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
    if (event === 'connected') this.onconnected = handler
    if (event === 'message') this.onmessage = handler
    if (event === 'error') this.onerror = handler as () => void
  })
  removeEventListener = vi.fn()

  constructor() {
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

installMock()

function TestSubscriber() {
  const { subscribe } = useRealtime()
  return (
    <button
      data-testid="subscribe"
      onClick={() => { subscribe(['cliente.*'], vi.fn()) }}
    >
      Subscribe
    </button>
  )
}

describe('ConnectivityIndicator realtime states', () => {
  beforeEach(() => {
    installMock()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    uninstallMock()
  })

  it('shows Conectando while SSE handshake is in progress', async () => {
    const { getByTestId } = render(
      <RealtimeProvider>
        <ConnectivityIndicator />
        <TestSubscriber />
      </RealtimeProvider>,
    )

    await act(async () => {
      getByTestId('subscribe').click()
      vi.advanceTimersByTime(0)
    })

    const indicator = getByTestId('connectivity-indicator')
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('Conectando'))
  })

  it('shows Online after SSE is open', async () => {
    const { getByTestId } = render(
      <RealtimeProvider>
        <ConnectivityIndicator />
        <TestSubscriber />
      </RealtimeProvider>,
    )

    await act(async () => {
      getByTestId('subscribe').click()
      vi.advanceTimersByTime(0)
    })

    const es = MockEventSource.instances[0]
    await act(async () => {
      es.onconnected?.(new MessageEvent('connected', { data: '{}' }))
    })

    const indicator = getByTestId('connectivity-indicator')
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('Online'))
  })

  it('shows Sync when polling fallback is active', async () => {
    const { getByTestId } = render(
      <RealtimeProvider>
        <ConnectivityIndicator />
        <TestSubscriber />
      </RealtimeProvider>,
    )

    await act(async () => {
      getByTestId('subscribe').click()
      vi.advanceTimersByTime(0)
    })

    // Force the provider into polling by firing 3 error events (exceeds
    // MAX_ERRORS_BEFORE_POLLING) while still online.
    const es = MockEventSource.instances[0]
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        es.onerror?.()
        vi.advanceTimersByTime(1_100) // past the 1s dedup window
      })
    }

    const indicator = getByTestId('connectivity-indicator')
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('Sync'))
  })
})
