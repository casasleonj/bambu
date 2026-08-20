// @tests rate-limit behavior (M5)
// Valida checkRateLimit, resetRateLimit, fail-open y env vars de realtime.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit, resetRateLimit, LIMITS } from '@/lib/rate-limit'

const IP = '127.0.0.1'

describe('M5: rate-limit behavior', () => {
  afterEach(async () => {
    await resetRateLimit(IP, 'api').catch(() => {})
    await resetRateLimit(IP, 'realtime').catch(() => {})
  })

  it('consume decrementa remaining hasta agotar el bucket', async () => {
    const first = await checkRateLimit(IP, 'api')
    expect(first.allowed).toBe(true)
    expect(first.limit).toBe(300)
    expect(first.remaining).toBe(299)

    // Consumir todo el bucket
    for (let i = 0; i < 299; i++) {
      await checkRateLimit(IP, 'api')
    }
    const lastAllowed = await checkRateLimit(IP, 'api')
    expect(lastAllowed.remaining).toBe(0)

    const blocked = await checkRateLimit(IP, 'api')
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  it('resetRateLimit restaura la capacidad del bucket', async () => {
    // Agotar
    for (let i = 0; i < 300; i++) {
      await checkRateLimit(IP, 'api')
    }
    const blocked = await checkRateLimit(IP, 'api')
    expect(blocked.allowed).toBe(false)

    await resetRateLimit(IP, 'api')

    const restored = await checkRateLimit(IP, 'api')
    expect(restored.allowed).toBe(true)
    expect(restored.remaining).toBe(299)
  })

  it('tipo por defecto es api', async () => {
    const res = await checkRateLimit(IP)
    expect(res.limit).toBe(300)
    expect(res.allowed).toBe(true)
  })

  it('LIMITS.api tiene la configuración esperada', () => {
    expect(LIMITS.api).toEqual({ points: 300, duration: 60, blockDuration: 0 })
  })
})

describe('M5: fallback de memoria en timeout de Redis comparte estado entre requests', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    vi.useRealTimers()
    vi.doUnmock('redis')
  })

  it('dos requests durante el mismo timeout de Redis decrementan el mismo bucket (no crean un limiter nuevo cada vez)', async () => {
    process.env.REDIS_URL = 'redis://fake-host:6379'

    // Simula un connect() de Redis que nunca resuelve (cold start severo /
    // datacenter lento) para forzar la rama REDIS_TIMEOUT de checkRateLimit.
    vi.doMock('redis', () => ({
      createClient: () => ({
        on: () => {},
        connect: () => new Promise(() => {}),
      }),
    }))

    const { checkRateLimit } = await import('@/lib/rate-limit')

    const firstPromise = checkRateLimit('740.740.740.740', 'api')
    await vi.advanceTimersByTimeAsync(3000)
    const first = await firstPromise
    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(299)

    const secondPromise = checkRateLimit('740.740.740.740', 'api')
    await vi.advanceTimersByTimeAsync(3000)
    const second = await secondPromise
    expect(second.allowed).toBe(true)
    // Antes del fix esto también daba 299 (cada request creaba su propio
    // RateLimiterMemory sin estado compartido, así que el límite nunca se
    // aplicaba de verdad durante el timeout).
    expect(second.remaining).toBe(298)
  })
})

describe('M5: realtime env vars', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('usa valores por defecto cuando no hay env vars', async () => {
    delete process.env.REALTIME_RATE_LIMIT_POINTS
    delete process.env.REALTIME_RATE_LIMIT_DURATION_SEC
    delete process.env.REALTIME_RATE_LIMIT_BLOCK_DURATION_SEC
    const { LIMITS: freshLimits } = await import('@/lib/rate-limit')
    expect(freshLimits.realtime).toEqual({
      points: 6,
      duration: 60,
      blockDuration: 0,
    })
  })

  it('respeta env vars de realtime', async () => {
    process.env.REALTIME_RATE_LIMIT_POINTS = '12'
    process.env.REALTIME_RATE_LIMIT_DURATION_SEC = '30'
    process.env.REALTIME_RATE_LIMIT_BLOCK_DURATION_SEC = '120'
    const { LIMITS: freshLimits } = await import('@/lib/rate-limit')
    expect(freshLimits.realtime).toEqual({
      points: 12,
      duration: 30,
      blockDuration: 120,
    })
  })

  it('no permite valores inválidos/menores a 1', async () => {
    process.env.REALTIME_RATE_LIMIT_POINTS = '0.5'
    process.env.REALTIME_RATE_LIMIT_DURATION_SEC = '0.5'
    process.env.REALTIME_RATE_LIMIT_BLOCK_DURATION_SEC = '-10'
    const { LIMITS: freshLimits } = await import('@/lib/rate-limit')
    expect(freshLimits.realtime).toEqual({
      points: 1,
      duration: 1,
      blockDuration: 0,
    })
  })
})
