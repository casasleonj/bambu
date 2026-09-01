/**
 * POST /api/rutas/planes/[id]/confirmar — confirma el plan y materializa embarques.
 *
 * Contrato: ADR-PLANIFICADOR-003, -005 §4. Auth: ADMIN, ASISTENTE.
 * Body: { expectedVersion, idempotencyKey? }.
 *   409 si expectedVersion no coincide (el plan cambió).
 *   200 con estado CONFIRMED | INTEGRATION_PARTIAL.
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
import { ConfirmarPlanUseCase } from '@/modules/planificador/application/use-cases/ConfirmarPlanUseCase'
import { publishRealtimeEvent } from '@/lib/realtime'
import { prisma } from '@/lib/prisma'

const BodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(200).optional(),
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('Body requerido', 400)
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return apiError('Datos inválidos', 400)

  try {
    const maxUnidades = await getConfigInt('MAX_UNIDADES_EMBARQUE', MAX_UNIDADES)
    const useCase = new ConfirmarPlanUseCase()
    const result = await useCase.execute({
      planId: id,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
      maxUnidades,
      userId,
    })

    logAudit({
      entidad: 'PlanDia',
      registroId: id,
      accion: 'UPDATE',
      datos: {
        accion: 'confirmar',
        estado: result.estado,
        embarquesCreados: result.materializacion.creados.length,
        gruposFallidos: result.materializacion.fallidos.length,
        deduped: result.deduped,
      },
      usuarioId: userId,
    })

    const pd = await prisma.planDia.findUnique({ where: { id }, select: { fecha: true } })
    if (pd) publishRealtimeEvent('route_plan.updated', pd.fecha.toISOString().slice(0, 10)).catch(() => {})

    return apiSuccess({
      estado: result.estado,
      deduped: result.deduped,
      embarques: result.materializacion.creados,
      fallidos: result.materializacion.fallidos,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    if (msg === 'PLAN_NOT_FOUND') return apiError('Plan no encontrado', 404)
    if (msg === 'VERSION_CONFLICT') {
      return apiError('El plan cambió mientras lo revisabas. Recargá la versión vigente.', 409)
    }
    if (msg === 'ESTADO_INVALIDO') {
      return apiError('El plan no está en un estado que permita confirmar.', 409)
    }
    logger.error({ err: msg, id }, 'Error confirmando plan')
    return apiError('Error al confirmar el plan', 500)
  }
}
