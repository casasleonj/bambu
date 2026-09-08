import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import {
  ProyectarAjusteCantidadUseCase,
  ProyectarAjusteCantidadError,
} from '@/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase'

const ProyectarSchema = z.object({
  producto: z.string().min(1),
  cantidadNueva: z.number().int().min(0),
})

/**
 * POST /api/pedidos/[id]/ajustar-cantidad/preview — Fase 6-0 del rediseño de
 * Pedidos (docs/pedidos/fase6-g11-flujo-plan.md §2). **Proyección read-only**
 * del impacto de una corrección de cantidad (G11 rama A) ANTES de ejecutarla.
 * NUNCA muta. El commit (`POST .../ajustar-cantidad`) revalida y recalcula
 * todo dentro de su lock.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = ProyectarSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new ProyectarAjusteCantidadUseCase()
    const result = await useCase.execute({
      pedidoId: id,
      producto: parsed.data.producto,
      cantidadNueva: parsed.data.cantidadNueva,
    })
    return apiSuccess(result)
  } catch (error) {
    if (error instanceof ProyectarAjusteCantidadError) {
      const msg = error.message
      if (msg === 'PEDIDO_NOT_FOUND') return apiError('Pedido no encontrado', 404)
      if (msg.startsWith('PEDIDO_ITEM_NOT_FOUND')) return apiError(msg, 404)
      return apiError(msg, 400)
    }
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown' },
      'Error proyectando ajuste de cantidad',
    )
    return apiError('Error proyectando el ajuste de cantidad', 500)
  }
}
