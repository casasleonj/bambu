/**
 * Event name used to signal that the user's session has expired or was
 * revoked server-side. Dispatched from fetchResilient on 401/403 responses
 * and listened to by SessionExpiryGuard to redirect to /login.
 *
 * Namespaced as 'app:auth:expired' to avoid collision with Auth.js internal
 * events or third-party libraries.
 */
export const AUTH_EXPIRED_EVENT = 'app:auth:expired'

/**
 * Module-level flag to distinguish intentional signOut (user clicked
 * "Cerrar Sesión") from unexpected session expiry (JWT expired / revoked).
 *
 * Set to `true` via `markIntentionalSignOut()` immediately before calling
 * `signOut()`. The SessionExpiryGuard checks this flag and skips its redirect
 * when the user is intentionally signing out, allowing Auth.js's own
 * `callbackUrl: '/login'` redirect to complete cleanly.
 *
 * Auto-resets after 5s to prevent stale flags.
 */
export let isIntentionalSignOut = false

export function markIntentionalSignOut() {
  isIntentionalSignOut = true
  setTimeout(() => {
    isIntentionalSignOut = false
  }, 5000)
}

/**
 * Reset for tests. Import and call in beforeEach to avoid cross-test leakage.
 */
export function resetIntentionalSignOut() {
  isIntentionalSignOut = false
}
