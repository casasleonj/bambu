import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { getBatch } from '@/lib/import/application'
import { logger } from '@/lib/logger'

interface RouteParams {
  params: Promise<{ batchId: string }>
}

/**
 * GET /api/admin/import/[batchId]
 *
 * Devuelve el detalle de un batch, incluyendo sus filas de staging.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { batchId } = await params
    const userId = (authResult.user as { id?: string } | undefined)?.id ?? ''
    const batch = await getBatch(batchId, userId)

    if (!batch) {
      return apiError('Batch no encontrado', 404)
    }

    return apiSuccess({ batch })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error obteniendo el batch'
    logger.error({ error: message }, 'import get batch failed')
    return apiError(message, 500)
  }
}
