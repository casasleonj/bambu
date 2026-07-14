import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { RealtimeProvider } from '@/components/realtime-provider'
import { useReconnectHandler } from '@/hooks/use-reconnect-handler'

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
  }

  static get instances() {
    return instances
  }
}

describe('useReconnectHandler', () => {
  beforeEach(() => {
    instances.length = 0
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    instances.forEach((i) => i.close())
    instances.length = 0
    vi.unstubAllGlobals()
  })

  it('does nothing when there is no RealtimeProvider', () => {
    const callback = vi.fn()
    expect(() => renderHook(() => useReconnectHandler(callback))).not.toThrow()
    expect(callback).not.toHaveBeenCalled()
  })

  it('calls callback when the SSE connection connects', async () => {
    const callback = vi.fn()
    renderHook(() => useReconnectHandler(callback), { wrapper: RealtimeProvider })

    await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0), { timeout: 500 })
    const esInstance = MockEventSource.instances[0]

    act(() => {
      esInstance.onconnected?.(new MessageEvent('connected', { data: '{}' }))
    })

    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1), { timeout: 500 })
  })

  it('uses the latest callback closure', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useReconnectHandler(cb),
      { wrapper: RealtimeProvider, initialProps: { cb: first } },
    )

    await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0), { timeout: 500 })
    const esInstance = MockEventSource.instances[0]

    rerender({ cb: second })
    act(() => {
      esInstance.onconnected?.(new MessageEvent('connected', { data: '{}' }))
    })

    await waitFor(() => expect(second).toHaveBeenCalledTimes(1), { timeout: 500 })
    expect(first).not.toHaveBeenCalled()
  })

  it('removes the handler on unmount', async () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => useReconnectHandler(callback), { wrapper: RealtimeProvider })

    await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0), { timeout: 500 })
    const esInstance = MockEventSource.instances[0]

    unmount()
    act(() => {
      esInstance.onconnected?.(new MessageEvent('connected', { data: '{}' }))
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(callback).not.toHaveBeenCalled()
  })
})
