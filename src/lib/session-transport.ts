import { withAuthCookieLock } from './auth-cookie-lock'

export type SessionTransportState = 'unknown' | 'valid' | 'invalid' | 'unavailable'
let lastState: SessionTransportState = 'unknown'
let installed = 0
let restore: (() => void) | undefined
export const SESSION_TRANSPORT_EVENT = 'bambu:session-transport'

export function getSessionTransportState(): SessionTransportState {
  return lastState
}

function setState(value: SessionTransportState) {
  lastState = value
  window.dispatchEvent(new Event(SESSION_TRANSPORT_EVENT))
}

/** Keep the SDK's Provider, while coordinating its cookie-writing transport. */
export function installSessionTransport(): () => void {
  installed++
  if (installed === 1) {
    const original = window.fetch
    const guarded: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
      if (url.origin !== window.location.origin || !['/api/auth/session', '/api/auth/csrf', '/api/auth/signout'].includes(url.pathname)) {
        return original.call(window, input, init)
      }
      const isSession = url.pathname === '/api/auth/session'
      const request = async () => {
        const controller = new AbortController()
        const upstream = init?.signal ?? (input instanceof Request ? input.signal : undefined)
        const abort = () => controller.abort()
        if (upstream?.aborted) abort()
        upstream?.addEventListener('abort', abort, { once: true })
        const timer = setTimeout(abort, 10_000)
        try {
          const response = await original.call(window, input, { ...init, signal: controller.signal })
          // Hold the cookie lock through the full response, not just arrival of headers.
          await response.clone().arrayBuffer()
          if (isSession) {
            const data: unknown = response.ok ? await response.clone().json().catch(() => undefined) : undefined
            if (!response.ok || data === undefined) setState('unavailable')
            else if (data && typeof data === 'object' && 'authStatus' in data && data.authStatus === 'unavailable') setState('unavailable')
            else if (data && typeof data === 'object' && 'user' in data && data.user && typeof data.user === 'object' && 'id' in data.user && data.user.id) setState('valid')
            else if (data === null || (typeof data === 'object' && data && (
              ('authStatus' in data && data.authStatus === 'invalid') ||
              ('user' in data && 'expires' in data && !('authStatus' in data))
            ))) setState('invalid')
            else setState('unavailable')
          } else if (url.pathname === '/api/auth/signout') {
            if (!response.ok) throw new Error('No se pudo confirmar el cierre de sesión')
            const body = init?.body
            const callback = typeof body === 'string' || body instanceof URLSearchParams
              ? new URLSearchParams(body).get('callbackUrl') : null
            // The SDK follows the server response. Reject an error URL or
            // ambiguous response for our explicit logout, not a false success.
            if (callback === '/login?reason=signedout') {
              const data: unknown = await response.clone().json()
              const target = data && typeof data === 'object' && 'url' in data && typeof data.url === 'string'
                ? new URL(data.url, window.location.href) : null
              if (!target || target.origin !== window.location.origin ||
                  target.pathname !== '/login' || target.search !== '?reason=signedout' || target.hash) {
                throw new Error('No se pudo confirmar el cierre de sesión')
              }
            }
          }
          return response
        } catch (error) {
          if (isSession) setState('unavailable')
          throw error
        } finally {
          clearTimeout(timer)
          upstream?.removeEventListener('abort', abort)
        }
      }
      try {
        return await (isSession ? withAuthCookieLock(request) : request())
      } catch (error) {
        if (isSession) setState('unavailable')
        throw error
      }
    }
    window.fetch = guarded
    restore = () => { if (window.fetch === guarded) window.fetch = original }
  }
  return () => {
    installed--
    if (installed === 0) { restore?.(); restore = undefined; lastState = 'unknown' }
  }
}
