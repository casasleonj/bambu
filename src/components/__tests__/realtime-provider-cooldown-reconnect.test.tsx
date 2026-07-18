// @tests realtime-provider — fix del bug latent "circuit breaker sin reconnect tras cooldown"
// Cubre el caso que el test existente no verifica: tras los 5min de cooldown
// del circuit breaker, el provider SÍ debe reintentar abrir el SSE.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { RealtimeProvider } from '@/components/realtime-provider'

const instances: MockEventSource[] = []

class MockEventSource {
  onrateLimited: ((e: MessageEvent) => void) | null = null
  onconnected: ((e: MessageEvent) => void) | null = null
  close = vi.fn()
  addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
    if (event === 'connected') this.onconnected = handler
    if (event === 'rate_limited') this.onrateLimited = handler
  })
  removeEventListener = vi.fn()
  constructor() { instances.push(this) }
  static reset() { instances.forEach((i) => i.close()); instances.length = 0 }
}

function installMock() {
  MockEventSource.reset()
  // @ts-expect-error jsdom
  globalThis.EventSource = MockEventSource
}
function uninstallMock() {
  MockEventSource.reset()
  // @ts-expect-error
  globalThis.EventSource = undefined
}

async function flushInitialConnect() {
  await act(async () => { vi.advanceTimersByTime(0) })
}

describe('RealtimeProvider — circuit breaker reconnect tras cooldown', () => {
  beforeEach(() => {
    installMock()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    uninstallMock()
  })

  it('reconecta SSE tras expirar el cooldown de 5min del circuit breaker', async () => {
    render(<RealtimeProvider><div /></RealtimeProvider>)
    await flushInitialConnect()

    // Disparar 3 rate_limited consecutivos para activar circuit breaker (5min)
    for (let i = 0; i < 3; i++) {
      const es = instances[instances.length - 1]
      await act(async () => {
        es.onrateLimited?.(new MessageEvent('rate_limited', { data: JSON.stringify({ retryAfter: 1 }) }))
      })
      await act(async () => vi.advanceTimersByTime(100))
    }

    // Solo la conexión inicial existe durante cooldown
    const countDuringCooldown = instances.length
    expect(countDuringCooldown).toBe(1)

    // Esperar 120s: aún en cooldown (5min=300s), sin reconexión
    await act(async () => vi.advanceTimersByTime(120_000))
    expect(instances.length).toBe(countDuringCooldown)

    // Avanzar al cooldown completo (300s + holgura): FIX debe reconectar
    await act(async () => vi.advanceTimersByTime(200_000))
    // FIX: ahora programamos scheduleReconnect tras cooldown → nueva instancia
    expect(instances.length).toBeGreaterThan(countDuringCooldown)
  })
})