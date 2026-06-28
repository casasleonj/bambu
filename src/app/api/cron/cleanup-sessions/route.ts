import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { requireCronSecret } from '@/lib/cron-auth'
import { cleanupExpiredSessions } from '@/lib/session-store'

/**
 * POST /api/cron/cleanup-sessions
 *
 * Removes expired rows from SesionActiva. Runs daily from an external scheduler.
 * Protected by CRON_SECRET via x-cron-secret header.
 *
 * NOTE: This endpoint is intentionally POST (not GET) because it mutates data,
 * preventing accidental caching/prefetch.
 */
export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request)
  if (authError) return authError

  try {
    const deleted = await cleanupExpiredSessions()

    logger.info({ deleted }, 'Cron: sesiones expiradas limpiadas')

    return apiSuccess({
      message: `${deleted} sesiones expiradas eliminadas`,
      deleted,
    })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown' },
      'Cron error limpiando sesiones expiradas:',
    )
    return apiError('Error limpiando sesiones expiradas', 500)
  }
}
