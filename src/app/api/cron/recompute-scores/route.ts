/**
 * POST /api/cron/recompute-scores
 *
 * Job diario (6am Colombia). Recorre TODOS los clientes activos y recalcula
 * su score de demanda. Idempotente. Si falla en uno, sigue con los demás.
 *
 * Auth: header `x-cron-secret` (mismo patrón que otros cron jobs).
 *
 * Optimización: clientes que no han pedido en 6+ meses se saltan (no
 * generan outbound score significativo). Esto reduce el workload en
 * bases con miles de clientes inactivos.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCronSecret } from '@/lib/cron-auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { recomputeClienteScore } from '@/lib/demanda/recompute-cliente'

const ULTIMA_ACTIVIDAD_MINIMA = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) // 6 meses

export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request)
  if (authError) return authError

  const startTime = Date.now()
  let processed = 0
  let errors = 0
  const errorList: string[] = []

  try {
    // Solo clientes activos con pedidos en los últimos 6 meses
    const clientes = await prisma.cliente.findMany({
      where: {
        activo: true,
        pedidos: { some: { fecha: { gte: ULTIMA_ACTIVIDAD_MINIMA } } },
      },
      select: { id: true },
    })

    for (const c of clientes) {
      try {
        await recomputeClienteScore(c.id)
        processed++
      } catch (err) {
        errors++
        const msg = err instanceof Error ? err.message : 'unknown'
        errorList.push(`${c.id}: ${msg}`)
        if (errorList.length < 5) {
          logger.error({ clienteId: c.id, err: msg }, 'Error recomputando score:')
        }
      }
    }

    const durationMs = Date.now() - startTime
    logger.info(
      { processed, errors, total: clientes.length, durationMs },
      'Cron recompute-scores completado',
    )

    return apiSuccess({
      processed,
      errors,
      total: clientes.length,
      durationMs,
      errorList: errorList.slice(0, 10),
    })
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : 'Unknown' },
      'Cron recompute-scores falló:',
    )
    return apiError('Error en cron recompute-scores', 500)
  }
}
