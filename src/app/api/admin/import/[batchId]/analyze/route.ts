import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { analyzeBatch } from '@/lib/import/application'
import { logger } from '@/lib/logger'

interface RouteParams {
  params: Promise<{ batchId: string }>
}

/**
 * POST /api/admin/import/[batchId]/analyze
 *
 * Corre el matcher de duplicados sobre las filas CLIENTE del batch y
 * actualiza sus matchCandidates / decisiones. El batch pasa a ANALYZED.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { batchId } = await params
    const userId = (authResult.user as { id?: string } | undefined)?.id ?? ''
    const result = await analyzeBatch(batchId, userId)

    logger.info({ batchId, userId, result }, 'import analyze completed')

    return apiSuccess(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error analizando el batch'
    logger.error({ error: message }, 'import analyze failed')
    return apiError(message, 400)
  }
}
