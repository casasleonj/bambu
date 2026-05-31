import { NextRequest } from 'next/server'
import { previewGeneracionRecurrentes, generarPedidosRecurrentes } from '@/lib/recurrentes'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { requireCronSecret } from '@/lib/cron-auth'

/**
 * POST /api/cron/generar-recurrentes
 * Runs daily at 6am. Generates pedidos from recurrent templates.
 * Protected by CRON_SECRET via x-cron-secret header.
 * Uses POST (not GET) because it creates resources — prevents accidental caching/prefetch.
 */
export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request)
  if (authError) return authError

  try {
    const preview = await previewGeneracionRecurrentes()

    const decisiones = preview
      .map(p => ({
        recurrenteId: p.recurrenteId,
        decision: 'NORMAL' as const,
      }))

    if (decisiones.length === 0) {
      return apiSuccess({ message: 'Nada que generar', generados: 0, saltados: 0 })
    }

    const resultado = await generarPedidosRecurrentes(decisiones)

    logger.info({
      generados: resultado.generados.length,
      saltados: resultado.saltados.length,
    }, 'Cron: pedidos recurrentes generados')

    return apiSuccess({
      message: `${resultado.generados.length} generados, ${resultado.saltados.length} saltados`,
      generados: resultado.generados.length,
      saltados: resultado.saltados.length,
      detalle: resultado.generados,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Cron error generando recurrentes:')
    return apiError('Error en generacion automatica', 500)
  }
}
