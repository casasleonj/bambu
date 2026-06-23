import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { recordDecision } from '@/lib/import/application'
import { logger } from '@/lib/logger'
import { formatZodError } from '@/lib/utils'

interface RouteParams {
  params: Promise<{ batchId: string }>
}

const DecideBodySchema = z.object({
  stagingRowId: z.string().min(1),
  decision: z.enum(['MANUAL_MERGE', 'CREATE_NEW', 'SKIP']),
  targetId: z.string().optional(),
}).refine(
  (data) => data.decision !== 'MANUAL_MERGE' || (data.targetId && data.targetId.trim() !== ''),
  {
    message: 'MANUAL_MERGE requiere targetId',
    path: ['targetId'],
  }
)

/**
 * POST /api/admin/import/[batchId]/decide
 *
 * Registra la decisión del usuario para una fila de staging.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { batchId } = await params
    const body = await request.json()
    const parsed = DecideBodySchema.safeParse(body)

    if (!parsed.success) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const { stagingRowId, decision, targetId } = parsed.data
    const userId = (authResult.user as { id?: string } | undefined)?.id ?? ''
    await recordDecision(batchId, stagingRowId, userId, decision, targetId)

    logger.info({ batchId, userId, stagingRowId, decision, targetId }, 'import decision recorded')

    return apiSuccess({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error guardando la decisión'
    logger.error({ error: message }, 'import decide failed')
    return apiError(message, 400)
  }
}
