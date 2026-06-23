import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { commitBatch } from '@/lib/import/application'
import { logger } from '@/lib/logger'

interface RouteParams {
  params: Promise<{ batchId: string }>
}

/**
 * POST /api/admin/import/[batchId]/commit
 *
 * Ejecuta la importación: crea/mergea los registros reales en la base de datos.
 * Es una operación atómica; si falla, se revierte todo.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { batchId } = await params
    const userId = (authResult.user as { id?: string } | undefined)?.id ?? ''
    const result = await commitBatch(batchId, userId)

    logger.info({ batchId, userId, result }, 'import commit completed')

    return apiSuccess(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error importando los datos'
    logger.error({ error: message }, 'import commit failed')
    return apiError(message, 500)
  }
}
