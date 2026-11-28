/**
 * Revoke the current active session on the backend before signing out.
 *
 * This is defense-in-depth: the server-side `events.signOut` handler also
 * revokes the session, but in JWT-only flows the client-side signOut request
 * may not always carry the token (e.g. if the session was already invalidated
 * by device limits). Calling this first ensures the row is deleted.
 */
import { signOut } from 'next-auth/react'
import { withAuthCookieLock } from './auth-cookie-lock'
import { markIntentionalSignOut, resetIntentionalSignOut } from './auth-events'
import { purgeSWCache } from './purge-sw-cache'
import { unsubscribePushOnLogout } from './push-cleanup'
import { SessionChangedError } from './session-status'

export async function revokeSessionOnLogout(expectedSessionId?: string): Promise<void> {
  if (typeof window === 'undefined') return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch('/api/auth/logout-session', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(expectedSessionId ? { 'x-session-id': expectedSessionId } : {}) },
      signal: controller.signal,
    })
    if (response.status === 409) throw new SessionChangedError()
    if (!response.ok) throw new Error('No se pudo confirmar el cierre de sesión')
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
      throw new Error('No se pudo confirmar el cierre de sesión')
    }
  } finally {
    clearTimeout(timer)
  }
}

export const LOGOUT_CLEANUP_TIMEOUT_MS = 10_000

export async function logoutSafely(expectedSessionId?: string): Promise<void> {
  // The visible deadline is deliberately separate from the lock lifetime.
  // A browser cleanup operation may not be abortable. On timeout the caller
  // can show a retry, but no later cookie writer may start until it settles.
  const controller = new AbortController()
  let rejectDeadline!: (error: Error) => void
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject })
  const operation = withAuthCookieLock(async () => {
    markIntentionalSignOut()
    try {
      await revokeSessionOnLogout(expectedSessionId)
      const timer = setTimeout(() => {
        const error = new Error('No se pudo confirmar el cierre de sesión')
        controller.abort(error)
        rejectDeadline(error)
      }, LOGOUT_CLEANUP_TIMEOUT_MS)
      try {
        await unsubscribePushOnLogout(controller.signal)
        controller.signal.throwIfAborted()
        await purgeSWCache(controller.signal)
        controller.signal.throwIfAborted()
      } finally {
        clearTimeout(timer)
      }
      // Never run a late signOut after a visible cleanup timeout.
      await signOut({ redirectTo: '/login?reason=signedout' })
    } catch (error) {
      resetIntentionalSignOut()
      throw error
    }
  })
  await Promise.race([operation, deadline])
}
