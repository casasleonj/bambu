import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { revokeSession } from '@/lib/session-store'
import { logger } from '@/lib/logger'
import { sessionUnavailableResponse } from '@/lib/session-status'
import { logAudit } from '@/lib/audit'

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
export async function DELETE(request: Request) {
  try {
    const session = await auth()
    const sessionId = session?.user?.sessionId

    if (!sessionId) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const expectedSessionId = request.headers.get('x-session-id')
    if (expectedSessionId && expectedSessionId !== sessionId) {
      return NextResponse.json({ error: { code: 'SESSION_CHANGED' } }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }

    const revoked = await revokeSession(sessionId)
    if (revoked && session.user.id) {
      await logAudit({
        entidad: 'User', registroId: session.user.id, accion: 'FORCE_LOGOUT',
        datos: { sessionId, reason: 'USER_LOGOUT' }, usuarioId: session.user.id,
      }).catch(() => {})
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown error' },
      'Error revoking session via /api/auth/logout-session',
    )
    // Do not certify a remote logout that could not be verified.
    return sessionUnavailableResponse()
  }
}
