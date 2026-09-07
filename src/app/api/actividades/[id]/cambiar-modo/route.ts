import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { CambiarModoActividadUseCase } from '@/modules/embarques/application/use-cases/CambiarModoActividadUseCase'

const CambiarModoSchema = z.object({
  modoDestino: z.enum(['PUNTO', 'DOMICILIO']),
  motivo: z.string().optional(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/actividades/[id]/cambiar-modo — Fase 2 del rediseño de Pedidos
 * (docs/pedidos/00-plan-frontend-rediseno-integral.md D4): primer endpoint
 * HTTP para `CambiarModoActividadUseCase` (N2, AGUA_BAMBU_N2_ALS_v2.0.md
 * §3.2, Caso E) — probado (cambiar-modo-actividad-integridad.test.ts) pero
 * sin ruta expuesta. Thin controller.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params
  const actorId = role.user?.id
  if (!actorId) return apiError('No autorizado', 401)

  try {
    const body = await request.json()
    const parsed = CambiarModoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new CambiarModoActividadUseCase()
    const result = await useCase.execute({
      actividadId: id,
      modoDestino: parsed.data.modoDestino,
      motivo: parsed.data.motivo,
      actorId,
      offlineId: parsed.data.offlineId,
    })

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'ACTIVIDAD_NOT_FOUND') return apiError('Actividad no encontrada', 404)
      if (error.message === 'PEDIDO_NOT_FOUND') return apiError('Pedido no encontrado', 404)
      if (error.message.startsWith('PEDIDO_ITEM_NOT_FOUND')) return apiError(error.message, 404)
      if (error.message.startsWith('ACTIVIDAD_NO_MODIFICABLE')) return apiError(error.message, 409)
      if (error.message === 'ACTIVIDAD_SIN_MODO') return apiError(error.message, 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error cambiando modo de actividad')
    return apiError('Error cambiando modo de actividad', 500)
  }
}
