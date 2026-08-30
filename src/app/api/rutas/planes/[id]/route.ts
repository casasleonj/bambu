/**
 * GET /api/rutas/planes/[id] — plan completo por id.
 *
 * Contrato: ADR-PLANIFICADOR-001 §5. Auth: view:rutas.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { PrismaPlanificadorRepository } from '@/modules/planificador/infrastructure/PrismaPlanificadorRepository'
import { serializePlan } from '@/modules/planificador/presentation/serialize-plan'
import { OverridePlanUseCase } from '@/modules/planificador/application/use-cases/OverridePlanUseCase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params

  try {
    const repo = new PrismaPlanificadorRepository()
    const plan = await repo.obtenerPlan(id)
    if (!plan) return apiError('Plan no encontrado', 404)
    return apiSuccess({ plan: serializePlan(plan) })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown', id },
      'Error obteniendo plan',
    )
    return apiError('Error al obtener el plan', 500)
  }
}

const PatchSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  op: z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('moverPedido'), pedidoId: z.string().min(1), grupoDestinoId: z.string().min(1) }),
    z.object({ tipo: z.literal('asignarRepartidor'), grupoId: z.string().min(1), trabajadorId: z.string().min(1).nullable() }),
    z.object({ tipo: z.literal('resolverExcepcion'), excepcionId: z.string().min(1), resolucion: z.enum(['RESUELTA', 'IGNORADA']) }),
  ]),
})

/** PATCH — override manual del plan (ADR-PLANIFICADOR-005 §4). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const userId = (authResult.user as { id?: string } | undefined)?.id

  let body: unknown
  try { body = await request.json() } catch { return apiError('Body requerido', 400) }
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return apiError('Datos inválidos', 400)

  try {
    await new OverridePlanUseCase().execute({
      planId: id,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      op: parsed.data.op,
      actorId: userId,
    })
    logAudit({
      entidad: 'PlanDia', registroId: id, accion: 'UPDATE',
      datos: { accion: 'override', op: parsed.data.op }, usuarioId: userId,
    })
    const plan = await new PrismaPlanificadorRepository().obtenerPlan(id)
    return apiSuccess({ plan: plan ? serializePlan(plan) : null })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    if (msg === 'PLAN_NOT_FOUND') return apiError('Plan no encontrado', 404)
    if (msg === 'VERSION_CONFLICT') return apiError('El plan cambió. Recargá y volvé a intentar.', 409)
    if (msg === 'ESTADO_INVALIDO') return apiError('El plan no está en un estado editable.', 409)
    if (['PEDIDO_NO_EN_PLAN', 'GRUPO_DESTINO_INVALIDO'].includes(msg)) return apiError(msg, 422)
    logger.error({ err: msg, id }, 'Error en override de plan')
    return apiError('Error al modificar el plan', 500)
  }
}

/** DELETE — cancela un plan no confirmado. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const userId = (authResult.user as { id?: string } | undefined)?.id

  try {
    const plan = await prisma.planDia.findUnique({ where: { id }, select: { estado: true } })
    if (!plan) return apiError('Plan no encontrado', 404)
    if (!['PROPOSED', 'REVIEW'].includes(plan.estado)) {
      return apiError('Solo se puede cancelar un plan no confirmado', 409)
    }
    await prisma.planDia.update({ where: { id }, data: { estado: 'CANCELLED' } })
    logAudit({ entidad: 'PlanDia', registroId: id, accion: 'DELETE', datos: { accion: 'cancelar' }, usuarioId: userId })
    return apiSuccess({ estado: 'CANCELLED' })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown', id }, 'Error cancelando plan')
    return apiError('Error al cancelar el plan', 500)
  }
}
