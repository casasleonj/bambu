/**
 * GET /api/rutas/planes?fecha=YYYY-MM-DD — plan vigente de una fecha.
 *
 * Contrato: ADR-PLANIFICADOR-001 §5. Auth: view:rutas (ADMIN, ASISTENTE, CONTADOR).
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { todayStringBogota } from '@/lib/dates'
import { PrismaPlanificadorRepository } from '@/modules/planificador/infrastructure/PrismaPlanificadorRepository'
import { serializePlan } from '@/modules/planificador/presentation/serialize-plan'

const QuerySchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  )
  if (!parsed.success) return apiError('Parámetros inválidos', 400)

  const fecha = parsed.data.fecha ?? todayStringBogota()

  try {
    const repo = new PrismaPlanificadorRepository()
    const plan = await repo.obtenerVigentePorFecha(fecha)
    return apiSuccess({ fecha, plan: plan ? serializePlan(plan) : null })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown', fecha },
      'Error obteniendo plan vigente',
    )
    return apiError('Error al obtener el plan', 500)
  }
}
