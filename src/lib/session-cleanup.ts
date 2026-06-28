/**
 * Revoke the current active session on the backend before signing out.
 *
 * This is defense-in-depth: the server-side `events.signOut` handler also
 * revokes the session, but in JWT-only flows the client-side signOut request
 * may not always carry the token (e.g. if the session was already invalidated
 * by device limits). Calling this first ensures the row is deleted.
 */
export async function revokeSessionOnLogout(): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    await fetch('/api/auth/logout-session', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {
      // Best-effort: the session may already be gone or the user offline.
    })
  } catch {
    // Ignore cleanup errors during logout.
  }
}
