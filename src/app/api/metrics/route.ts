import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess } from '@/lib/api-response'
import { getMetrics } from '@/lib/metrics'

/**
 * GET /api/metrics — expone los contadores operacionales (contrato §24).
 * Solo ADMIN. Las métricas son señal operacional, no sustituyen invariantes.
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireRole([ROLES.ADMIN])
  if (authResult instanceof Response) return authResult

  return apiSuccess({ metrics: getMetrics() })
}
