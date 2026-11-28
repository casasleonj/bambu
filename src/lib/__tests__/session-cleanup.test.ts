import { it, expect, vi, afterEach, beforeEach } from 'vitest'
const mocked = vi.hoisted(() => ({ signOut: vi.fn(), push: vi.fn(), cache: vi.fn() }))
vi.mock('next-auth/react', () => ({ signOut: mocked.signOut }))
vi.mock('@/lib/push-cleanup', () => ({ unsubscribePushOnLogout: mocked.push }))
vi.mock('@/lib/purge-sw-cache', () => ({ purgeSWCache: mocked.cache }))
import { logoutSafely, LOGOUT_CLEANUP_TIMEOUT_MS } from '@/lib/session-cleanup'
import { resetIntentionalSignOut } from '@/lib/auth-events'
import { SessionChangedError } from '@/lib/session-status'
import { withAuthCookieLock } from '@/lib/auth-cookie-lock'
beforeEach(() => { mocked.push.mockReset().mockResolvedValue(undefined); mocked.cache.mockReset().mockResolvedValue(undefined); mocked.signOut.mockReset().mockResolvedValue(undefined) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); resetIntentionalSignOut() })

it('does not announce logout or purge data when remote revocation is unconfirmed', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'unavailable' }, { status: 503 })))
  await expect(logoutSafely()).rejects.toThrow('No se pudo confirmar')
  expect(mocked.signOut).not.toHaveBeenCalled()
  expect(mocked.push).not.toHaveBeenCalled()
  expect(mocked.cache).not.toHaveBeenCalled()
})

it('keeps the existing cleanup and exits only after confirmed revocation', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })))
  await logoutSafely()
  expect(mocked.push).toHaveBeenCalledOnce()
  expect(mocked.cache).toHaveBeenCalledOnce()
  expect(mocked.signOut).toHaveBeenCalledWith({ redirectTo: '/login?reason=signedout' })
})

it('binds a delayed intent to its original session and never signs out a replacement account', async () => {
  const fetch = vi.fn(async () => Response.json({ error: { code: 'SESSION_CHANGED' } }, { status: 409 }))
  vi.stubGlobal('fetch', fetch)
  await expect(logoutSafely('session-a')).rejects.toBeInstanceOf(SessionChangedError)
  expect(fetch).toHaveBeenCalledWith('/api/auth/logout-session', expect.objectContaining({ headers: expect.objectContaining({ 'x-session-id': 'session-a' }) }))
  expect(mocked.signOut).not.toHaveBeenCalled()
  expect(mocked.push).not.toHaveBeenCalled()
  expect(mocked.cache).not.toHaveBeenCalled()
})

it('rejects a 200 response that does not confirm remote revocation', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false })))
  await expect(logoutSafely('session-a')).rejects.toThrow('No se pudo confirmar')
  expect(mocked.signOut).not.toHaveBeenCalled()
})

it.each(['push', 'cache'] as const)('shows retry when %s stalls but does not release a live writer or sign out late', async stage => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })))
  let finish!: () => void
  mocked[stage].mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  const attempt = logoutSafely('session-a')
  const assertion = expect(attempt).rejects.toThrow('No se pudo confirmar')
  await vi.advanceTimersByTimeAsync(LOGOUT_CLEANUP_TIMEOUT_MS)
  await assertion
  expect(mocked[stage]).toHaveBeenCalledWith(expect.any(AbortSignal))
  expect(mocked.signOut).not.toHaveBeenCalled()
  const next = vi.fn(async () => undefined)
  const waiting = withAuthCookieLock(next)
  await Promise.resolve()
  expect(next).not.toHaveBeenCalled()
  finish()
  await waiting
  expect(next).toHaveBeenCalledOnce()
  expect(mocked.signOut).not.toHaveBeenCalled()
  if (stage === 'push') expect(mocked.cache).not.toHaveBeenCalled()
})
