/**
 * POST /api/rutas/planes/[id]/replan — recalcula la propuesta de la fecha del
 * plan y la deja en REVIEW con el diff contra la vigente (ADR-PLANIFICADOR-005).
 *
 * El `[id]` identifica la fecha; el motor recalcula esa fecha. Auth: ADMIN, ASISTENTE.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { getConfigInt } from '@/lib/config'
import { MAX_UNIDADES } from '@/modules/embarques/domain/services/embarque-validation.service'
import { prisma } from '@/lib/prisma'
import { ReplanUseCase } from '@/modules/planificador/application/use-cases/ReplanUseCase'
import { publishRealtimeEvent } from '@/lib/realtime'

const BodySchema = z.object({
  trigger: z.enum(['MANUAL', 'NUEVO_PEDIDO', 'CANCELACION', 'CAMBIO_CANTIDAD', 'RECURSO', 'CAPACIDAD']).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const userId = (authResult.user as { id?: string } | undefined)?.id

  let body: unknown = {}
  try { body = await request.json() } catch { /* body opcional */ }
  const parsed = BodySchema.safeParse(body ?? {})
  if (!parsed.success) return apiError('Datos inválidos', 400)

  const plan = await prisma.planDia.findUnique({ where: { id }, select: { fecha: true } })
  if (!plan) return apiError('Plan no encontrado', 404)
  const fecha = plan.fecha.toISOString().slice(0, 10)

  try {
    const maxUnidades = await getConfigInt('MAX_UNIDADES_EMBARQUE', MAX_UNIDADES)
    const result = await new ReplanUseCase().execute({
      fecha, maxUnidades, actorId: userId, trigger: parsed.data.trigger,
    })

    logAudit({
      entidad: 'PlanDia', registroId: result.planId, accion: 'CREATE',
      datos: { accion: 'replan', trigger: parsed.data.trigger ?? 'MANUAL', version: result.version, diff: result.diff },
      usuarioId: userId,
    })

    publishRealtimeEvent('route_plan.updated', fecha).catch(() => {})

    return apiSuccess(
      { planId: result.planId, version: result.version, estado: result.estado, diff: result.diff, resumen: result.resumen },
      201,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    if (msg === 'SIN_PLAN_VIGENTE') return apiError('No hay un plan vigente para esa fecha', 404)
    if (msg === 'PLAN_YA_CONFIRMADO') {
      return apiError('El plan ya fue confirmado y tiene embarques. Cancelá el plan o operá sobre los embarques.', 409)
    }
    logger.error({ err: msg, fecha }, 'Error replanificando')
    return apiError('Error al replanificar', 500)
  }
}
