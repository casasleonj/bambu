import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, useState, type ComponentProps, type ReactNode } from 'react'
import { RealtimeContext, RealtimeProvider } from '@/components/realtime-provider'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import { useReconnectHandler } from '@/hooks/use-reconnect-handler'
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

describe('#779 — identidad y ciclo de vida de la suscripción', () => {
  type Context = NonNullable<ComponentProps<typeof RealtimeContext.Provider>['value']>
  let status: Context['status']
  let receive: (event: RealtimeEvent) => void
  const unsubscribe = vi.fn()
  const subscribe = vi.fn((_filters: string[], callback: typeof receive) => {
    receive = callback
    return unsubscribe
  })
  const registerReconnectHandler = vi.fn(() => vi.fn())
  const event: RealtimeEvent = { type: 'pedido.created', id: 'p779', timestamp: '2026-11-12T12:00:00Z' }
  function Wrapper({ children }: { children: ReactNode }) {
    // El provider real publica un objeto nuevo cuando cambia status.
    return createElement(RealtimeContext.Provider, {
      value: { status, disabled: false, subscribe, registerReconnectHandler },
    }, children)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    subscribe.mockClear()
    unsubscribe.mockClear()
    status = 'connecting'
  })
  afterEach(() => vi.useRealTimers())

  it('no reconecta por arrays inline equivalentes, callbacks nuevos o cambios de status', () => {
    const first = vi.fn(), latest = vi.fn()
    const h = renderHook(({ callback }) => useRealtimeListener(['pedido.*'], callback), {
      wrapper: Wrapper, initialProps: { callback: first },
    })
    for (const next of ['open', 'closed', 'polling', 'paused', 'open'] as const) {
      status = next
      h.rerender({ callback: latest })
    }
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
    act(() => { receive(event); vi.advanceTimersByTime(500) })
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledExactlyOnceWith(event)
    h.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('un cambio real de filtros reemplaza la suscripción y descarta su evento diferido', () => {
    const callback = vi.fn()
    const h = renderHook(({ filters }) => useRealtimeListener(filters, callback), {
      wrapper: Wrapper, initialProps: { filters: ['pedido.*'] },
    })
    act(() => receive(event))
    h.rerender({ filters: ['cliente.*'] })
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(subscribe).toHaveBeenLastCalledWith(['cliente.*'], expect.any(Function))
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(500))
    expect(callback).not.toHaveBeenCalled()
    h.unmount()
  })

  it('desmontar cancela el debounce; una pantalla cerrada no recibe el evento', () => {
    const callback = vi.fn()
    const h = renderHook(() => useRealtimeListener(['pedido.*'], callback), { wrapper: Wrapper })
    act(() => receive(event))
    h.unmount()
    // Incluso un emisor que conserve por error el callback anterior no
    // puede reactivar el trabajo de una suscripción ya cerrada.
    act(() => receive(event))
    act(() => vi.advanceTimersByTime(500))
    expect(callback).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('agrupa ráfagas y conserva la suscripción cuando el consumidor se vuelve a renderizar', () => {
    const callback = vi.fn()
    const h = renderHook(() => useRealtimeListener(['pedido.*'], callback, { debounceMs: 50 }), { wrapper: Wrapper })
    act(() => receive(event))
    act(() => vi.advanceTimersByTime(30))
    h.rerender()
    const last = { ...event, id: 'p780' }
    act(() => { receive(last); vi.advanceTimersByTime(49) })
    expect(callback).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(callback).toHaveBeenCalledExactlyOnceWith(last)
    expect(subscribe).toHaveBeenCalledTimes(1)
    h.unmount()
  })

  it('una lista vacía no suscribe y vaciarla cancela los eventos pendientes', () => {
    const callback = vi.fn()
    const h = renderHook(({ filters }) => useRealtimeListener(filters, callback), {
      wrapper: Wrapper, initialProps: { filters: [] as string[] },
    })
    expect(subscribe).not.toHaveBeenCalled()
    h.rerender({ filters: ['pedido.*'] })
    act(() => receive(event))
    h.rerender({ filters: [] })
    act(() => vi.advanceTimersByTime(500))
    expect(callback).not.toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    h.unmount()
  })

  it('el provider real en 2g no reinicia el polling cuando su consumidor actualiza estado', () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'connection')
    Object.defineProperty(navigator, 'connection', {
      configurable: true, value: { effectiveType: '2g', downlink: 0.5, saveData: true },
    })
    const updates = vi.fn()
    try {
      const h = renderHook(() => {
        const [refresh, setRefresh] = useState(0)
        useReconnectHandler(() => {
          updates()
          // Acotar la reproducción si reaparece el ciclo: el provider
          // descarta errores del consumidor, pero no se cuelga Vitest.
          if (updates.mock.calls.length <= 5) setRefresh(n => n + 1)
        })
        useRealtimeListener(['pedido.*'], () => {})
        return refresh
      }, { wrapper: RealtimeProvider })
      act(() => vi.advanceTimersByTime(100))
      expect(h.result.current).toBe(1)
      expect(updates).toHaveBeenCalledTimes(1)
      h.rerender()
      expect(updates).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(30000))
      expect(h.result.current).toBe(2)
      expect(updates).toHaveBeenCalledTimes(2)
      h.unmount()
      act(() => vi.advanceTimersByTime(30000))
      expect(updates).toHaveBeenCalledTimes(2)
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'connection', descriptor)
      else Reflect.deleteProperty(navigator, 'connection')
    }
  })
})
