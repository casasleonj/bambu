import { it, expect, vi, afterEach } from 'vitest'
import { installSessionTransport, getSessionTransportState } from '@/lib/session-transport'
import { withAuthCookieLock } from '@/lib/auth-cookie-lock'

let uninstall: (() => void) | undefined
afterEach(() => { uninstall?.(); uninstall = undefined; vi.unstubAllGlobals() })

it.each([
  [200, { user: { id: 'test' }, authStatus: 'valid' }, 'valid'],
  [200, { user: {}, authStatus: 'invalid' }, 'invalid'],
  [200, null, 'invalid'],
  [200, { user: {}, authStatus: 'unavailable' }, 'unavailable'],
  [503, { error: 'down' }, 'unavailable'],
  [200, { unexpected: 'payload' }, 'unavailable'],
])('classifies HTTP %s session payload without inferring expiry from errors', async (status, payload, expected) => {
  const fetch = vi.fn(async () => Response.json(payload, { status: Number(status) }))
  vi.stubGlobal('fetch', fetch)
  uninstall = installSessionTransport()
  await window.fetch('/api/auth/session')
  expect(getSessionTransportState()).toBe(expected)
})

it('does not intercept ordinary requests or session-looking paths on another origin', async () => {
  const fetch = vi.fn(async () => Response.json({ success: true }))
  vi.stubGlobal('fetch', fetch)
  uninstall = installSessionTransport()
  await window.fetch('/api/pedidos')
  await window.fetch('https://example.com/api/auth/session')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(getSessionTransportState()).toBe('unknown')
})

it('preserves credentials and reports a network failure as unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
  uninstall = installSessionTransport()
  await expect(window.fetch('/api/auth/session')).rejects.toThrow('offline')
  expect(getSessionTransportState()).toBe('unavailable')
})

it('keeps a subsequent transition waiting until the entire session body completes', async () => {
  vi.stubGlobal('navigator', {})
  let finish!: () => void
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"user":{"id":"test"},"authStatus":"valid"}'))
      finish = () => controller.close()
    },
  })
  const source = vi.fn(async () => new Response(body, { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', source)
  uninstall = installSessionTransport()
  const read = window.fetch('/api/auth/session')
  await vi.waitFor(() => expect(source).toHaveBeenCalledOnce())
  const transition = vi.fn(async () => undefined)
  const waiting = withAuthCookieLock(transition)
  await Promise.resolve()
  expect(transition).not.toHaveBeenCalled()
  finish()
  await read
  await waiting
  expect(transition).toHaveBeenCalledOnce()
  expect(getSessionTransportState()).toBe('valid')
})

it.each([{ url: '/login?error=Configuration' }, { url: 'https://example.com/login?reason=signedout' }, {}])(
  'rejects an ambiguous successful HTTP status for explicit logout: %j', async payload => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload)))
    uninstall = installSessionTransport()
    await expect(window.fetch('/api/auth/signout', {
      method: 'POST', body: new URLSearchParams({ callbackUrl: '/login?reason=signedout' }),
    })).rejects.toThrow('No se pudo confirmar')
  },
)

it('accepts the fixed same-origin logout destination', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ url: '/login?reason=signedout' })))
  uninstall = installSessionTransport()
  await expect(window.fetch('/api/auth/signout', {
    method: 'POST', body: new URLSearchParams({ callbackUrl: '/login?reason=signedout' }),
  })).resolves.toBeInstanceOf(Response)
})
