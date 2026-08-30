/**
 * GET /api/rutas/planes/[id] — plan completo por id.
 *
 * Contrato: ADR-PLANIFICADOR-001 §5. Auth: view:rutas.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { PrismaPlanificadorRepository } from '@/modules/planificador/infrastructure/PrismaPlanificadorRepository'
import { serializePlan } from '@/modules/planificador/presentation/serialize-plan'

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
