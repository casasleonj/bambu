import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { RealtimeProvider } from '@/components/realtime-provider'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import type { RealtimeEvent } from '@/lib/realtime'

// Minimal mock of EventSource so the provider can mount in jsdom.
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

  constructor(_url: string) {
    instances.push(this)
    // Simulate a connected ack immediately.
    setTimeout(() => {
      if (this.onconnected) {
        this.onconnected(new MessageEvent('connected', { data: '{}' }))
      }
    }, 0)
  }

  static get instances() {
    return instances
  }
}

function installMock() {
  instances.length = 0
  // @ts-expect-error jsdom does not provide EventSource.
  globalThis.EventSource = MockEventSource
}

function uninstallMock() {
  instances.forEach((i) => i.close())
  instances.length = 0
  // @ts-expect-error restore missing global.
  globalThis.EventSource = undefined
}

// Guard against other tests that may leave the global unset. The provider
// accesses EventSource lazily inside useEffect, but some test runners/schedulers
// can interleave suites, so keeping a live mock on the global is safer.
installMock()

describe('useRealtimeListener', () => {
  beforeEach(() => {
    installMock()
  })

  afterEach(() => {
    uninstallMock()
  })

  it('does nothing when there is no RealtimeProvider', () => {
    const callback = vi.fn()
    expect(() => renderHook(() => useRealtimeListener(['pedido.*'], callback))).not.toThrow()
    expect(callback).not.toHaveBeenCalled()
  })

  it('invokes callback when a matching event arrives', async () => {
    const callback = vi.fn()
    renderHook(
      () => {
        useRealtimeListener(['pedido.*'], callback, { debounceMs: 50 })
        return null
      },
      { wrapper: RealtimeProvider },
    )

    // Trigger a message through the mocked EventSource instance.
    const esInstance = MockEventSource.instances[0]
    if (esInstance) {
      const event: RealtimeEvent = { type: 'pedido.created', id: 'p1', timestamp: new Date().toISOString() }
      esInstance.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }))
    }

    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1), { timeout: 500 })
    expect(callback.mock.calls[0][0]).toMatchObject({ type: 'pedido.created', id: 'p1' })
  })

  it('ignores events that do not match the filter', async () => {
    const callback = vi.fn()
    renderHook(
      () => {
        useRealtimeListener(['cliente.*'], callback, { debounceMs: 50 })
        return null
      },
      { wrapper: RealtimeProvider },
    )

    const esInstance = MockEventSource.instances[0]
    if (esInstance) {
      const event: RealtimeEvent = { type: 'pedido.created', id: 'p1', timestamp: new Date().toISOString() }
      esInstance.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }))
    }

    await new Promise((r) => setTimeout(r, 100))
    expect(callback).not.toHaveBeenCalled()
  })
})
