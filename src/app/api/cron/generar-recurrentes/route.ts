import { NextRequest } from 'next/server'
import { previewGeneracionRecurrentes, generarPedidosRecurrentes } from '@/lib/recurrentes'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { requireCronSecret } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'

// Actor técnico del cron (plan de integridad v1.2 §5.E): la generación
// automática nunca se atribuye a una persona.
const SISTEMA_USERNAME = 'system@bambu.local'

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
    const systemUser = await prisma.user.findUnique({
      where: { username: SISTEMA_USERNAME },
      select: { id: true },
    })
    if (!systemUser) {
      logger.error('[cron generar-recurrentes] SYSTEM user no existe. Corre el seed.')
      return apiError('SYSTEM user no existe. Ejecutar seed primero.', 500)
    }

    const preview = await previewGeneracionRecurrentes()

    const decisiones = preview
      .map(p => ({
        recurrenteId: p.recurrenteId,
        decision: 'NORMAL' as const,
      }))

    if (decisiones.length === 0) {
      return apiSuccess({ message: 'Nada que generar', generados: 0, saltados: 0 })
    }

    const resultado = await generarPedidosRecurrentes(decisiones, new Date(), {
      actor: { usuarioId: systemUser.id, proceso: 'cron' },
    })

    logger.info({
      generados: resultado.generados.length,
      saltados: resultado.saltados.length,
      omitidos: resultado.omitidos,
    }, 'Cron: pedidos recurrentes generados')

    return apiSuccess({
      message: `${resultado.generados.length} generados, ${resultado.saltados.length} saltados`,
      generados: resultado.generados.length,
      saltados: resultado.saltados.length,
      // Plantillas no generadas por destino no localizable (con motivo).
      omitidos: resultado.omitidos,
      detalle: resultado.generados,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Cron error generando recurrentes:')
    return apiError('Error en generacion automatica', 500)
  }
}
