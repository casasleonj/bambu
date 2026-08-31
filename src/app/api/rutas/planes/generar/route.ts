/**
 * POST /api/rutas/planes/generar — genera la propuesta de distribución de una fecha.
 *
 * Contrato: ADR-PLANIFICADOR-001 §5. Auth: ADMIN, ASISTENTE (permiso view:rutas).
 * Generación síncrona; devuelve la propuesta persistida como PlanDia PROPOSED.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { todayStringBogota } from '@/lib/dates'
import { formatZodError } from '@/lib/utils'
import { getConfigInt } from '@/lib/config'
import { MAX_UNIDADES } from '@/modules/embarques/domain/services/embarque-validation.service'
import { GenerarPlanUseCase } from '@/modules/planificador/application/use-cases/GenerarPlanUseCase'
import { publishRealtimeEvent } from '@/lib/realtime'

const BodySchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // body vacío es válido → usa hoy
  }
  const parsed = BodySchema.safeParse(body ?? {})
  if (!parsed.success) {
    return apiError('Datos inválidos', 400, { formErrors: [formatZodError(parsed.error)] })
  }

  const fecha = parsed.data.fecha ?? todayStringBogota()
  const userId = (authResult.user as { id?: string } | undefined)?.id

  try {
    const maxUnidades = await getConfigInt('MAX_UNIDADES_EMBARQUE', MAX_UNIDADES)
    const useCase = new GenerarPlanUseCase()
    const result = await useCase.execute({ fecha, maxUnidades, generadoPorId: userId })

    logAudit({
      entidad: 'PlanDia',
      registroId: result.planId,
      accion: 'CREATE',
      datos: { fecha, version: result.version, grupos: result.grupos, excepciones: result.excepciones },
      usuarioId: userId,
    })

    publishRealtimeEvent('route_plan.updated', fecha).catch(() => {})

    return apiSuccess(
      {
        planId: result.planId,
        version: result.version,
        estado: 'PROPOSED',
        resumen: result.resumen,
      },
      201,
    )
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown', fecha },
      'Error generando plan de distribución',
    )
    return apiError('Error al generar el plan', 500)
  }
}
