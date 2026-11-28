import { it, expect, vi, afterEach } from 'vitest'
import { withAuthCookieLock, AUTH_COOKIE_LOCK, AuthCookieLockError } from '@/lib/auth-cookie-lock'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('serializes same-tab writers when Web Locks is absent', async () => {
  vi.stubGlobal('navigator', {})
  let release!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })
  const order: string[] = []
  const first = withAuthCookieLock(async () => { order.push('read'); await barrier; order.push('read-complete') })
  const second = withAuthCookieLock(async () => { order.push('login') })
  await Promise.resolve()
  expect(order).toEqual(['read'])
  release()
  await Promise.all([first, second])
  expect(order).toEqual(['read', 'read-complete', 'login'])
})

it('uses the same origin-wide lock for session reads and transitions', async () => {
  const request = vi.fn(async (_name: string, _options: LockOptions, action: () => Promise<number>) => action())
  vi.stubGlobal('navigator', { locks: { request } })
  expect(await withAuthCookieLock(async () => 7)).toBe(7)
  expect(request).toHaveBeenCalledWith(AUTH_COOKIE_LOCK, expect.objectContaining({ signal: expect.any(AbortSignal) }), expect.any(Function))
})

it('times out waiting for a frozen tab without starting a second writer', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { locks: { request: (_name: string, options: LockOptions) => new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) } })
  const action = vi.fn()
  const attempt = withAuthCookieLock(action)
  const assertion = expect(attempt).rejects.toBeInstanceOf(AuthCookieLockError)
  await vi.advanceTimersByTimeAsync(12_001)
  await assertion
  expect(action).not.toHaveBeenCalled()
})

it('does not turn an error after acquisition into a lock timeout', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: LockOptions, action: () => Promise<void>) => action() } })
  const original = new Error('business error')
  const attempt = withAuthCookieLock(async () => { await new Promise(resolve => setTimeout(resolve, 15_000)); throw original })
  const assertion = expect(attempt).rejects.toBe(original)
  await vi.advanceTimersByTimeAsync(15_001)
  await assertion
})

it('bounds a fallback queue waiter without executing it after the timeout', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', {})
  let release!: () => void
  const first = withAuthCookieLock(() => new Promise<void>(resolve => { release = resolve }))
  await Promise.resolve()
  const expired = vi.fn(async () => undefined)
  const queued = withAuthCookieLock(expired)
  const assertion = expect(queued).rejects.toBeInstanceOf(AuthCookieLockError)
  await vi.advanceTimersByTimeAsync(12_001)
  await assertion
  release()
  await first
  await withAuthCookieLock(async () => undefined)
  expect(expired).not.toHaveBeenCalled()
})
