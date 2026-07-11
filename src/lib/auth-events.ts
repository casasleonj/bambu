/**
 * Event name used to signal that the user's session has expired or was
 * revoked server-side. Dispatched from fetchResilient on 401/403 responses
 * and listened to by SessionExpiryGuard to redirect to /login.
 *
 * Namespaced as 'app:auth:expired' to avoid collision with Auth.js internal
 * events or third-party libraries.
 */
export const AUTH_EXPIRED_EVENT = 'app:auth:expired'
