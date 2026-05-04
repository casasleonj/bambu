import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { previewGeneracionRecurrentes, generarPedidosRecurrentes, type DecisionGeneracion } from '@/lib/recurrentes'
import { z } from 'zod'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

const DecisionSchema = z.object({
  recurrenteId: z.string().min(1),
  decision: z.enum(['NORMAL', 'CON_PENDIENTES', 'SOLO_PENDIENTES', 'SALTAR']),
})

const GenerarRecurrentesSchema = z.object({
  decisiones: z.array(DecisionSchema).min(1),
  fecha: z.string().datetime().optional(),
})

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const preview = await previewGeneracionRecurrentes()
    return apiSuccess({ preview })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error preview recurrentes:')
    return apiError('Error al generar preview', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json().catch(() => ({}))
    const parsed = GenerarRecurrentesSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const decisiones: DecisionGeneracion[] = parsed.data.decisiones
    const fecha = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date()

    if (decisiones.length === 0) {
      return apiError('No se proporcionaron decisiones', 400)
    }

    const resultado = await generarPedidosRecurrentes(decisiones, fecha)

    return apiSuccess({
      generados: resultado.generados.length,
      saltados: resultado.saltados.length,
      pedidos: resultado.generados,
      saltadosIds: resultado.saltados,
    }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error generando recurrentes:')
    return apiError('Error generando pedidos recurrentes', 500)
  }
}
