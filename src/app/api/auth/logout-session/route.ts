import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { revokeSession } from '@/lib/session-store'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/auth/logout-session
 *
 * Revoke the current active session row from the backend.
 * This endpoint is intentionally separate from /api/auth/session because
 * Auth.js owns that route for session GET/POST operations.
 * It relies on the existing JWT session cookie to identify the user, then
 * deletes the matching SesionActiva row by sessionId.
 */
export async function DELETE() {
  try {
    const session = await auth()
    const sessionId = session?.user?.sessionId

    if (!sessionId) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    await revokeSession(sessionId)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown error' },
      'Error revoking session via /api/auth/logout-session',
    )
    // Fail-open: do not block logout because of a tracking error
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
