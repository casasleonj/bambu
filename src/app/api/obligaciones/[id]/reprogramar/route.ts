import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { ReprogramarObligacionPendienteUseCase } from '@/modules/embarques/application/use-cases/ReprogramarObligacionPendienteUseCase'

const ReprogramarSchema = z.object({
  fechaNueva: z.string().datetime(),
  motivo: z.string().optional(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/obligaciones/[id]/reprogramar — F4 (Plan Maestro §61, "reprogramación").
 * Cambia la fecha objetivo de un remanente (ObligacionPendiente) ya existente.
 * Mismos permisos que el resto de gestión de pendientes — no es una
 * autorización financiera, no se crea un nivel nuevo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const actorId = role.user?.id
  if (!actorId) return apiError('No autorizado', 401)

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = ReprogramarSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new ReprogramarObligacionPendienteUseCase()
    const result = await useCase.execute({
      obligacionId: id,
      fechaNueva: new Date(parsed.data.fechaNueva),
      actorId,
      motivo: parsed.data.motivo,
      offlineId: parsed.data.offlineId,
    })

    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('OBLIGACION_NOT_FOUND')) return apiError('Obligación no encontrada', 404)
      if (error.message.startsWith('OBLIGACION_NO_REPROGRAMABLE')) return apiError(error.message, 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error reprogramando obligación pendiente')
    return apiError('Error reprogramando obligación pendiente', 500)
  }
}
