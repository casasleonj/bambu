import { NextRequest } from 'next/server'
import type { ImportBatchEstado } from '@prisma/client'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { listBatches } from '@/lib/import/application'
import { logger } from '@/lib/logger'

/**
 * GET /api/admin/import
 *
 * Lista los batches de importación del usuario actual.
 * Query params: estado, page, pageSize
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const userId = (authResult.user as { id?: string } | undefined)?.id
    if (!userId) {
      return apiError('No se pudo identificar el usuario', 401)
    }

    const searchParams = request.nextUrl.searchParams
    const estado = searchParams.get('estado') as ImportBatchEstado | null
    const page = Number(searchParams.get('page') ?? '1')
    const pageSize = Number(searchParams.get('pageSize') ?? '20')

    const result = await listBatches(userId, {
      estado: estado ?? undefined,
      page: Number.isNaN(page) ? 1 : page,
      pageSize: Number.isNaN(pageSize) ? 20 : pageSize,
    })

    return apiSuccess(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error listando batches'
    logger.error({ error: message }, 'import list failed')
    return apiError(message, 500)
  }
}
