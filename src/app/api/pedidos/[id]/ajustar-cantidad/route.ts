import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { AjustarPedidoCantidadUseCase } from '@/modules/pedidos/application/use-cases/AjustarPedidoCantidadUseCase'

const AjusteSchema = z.object({
  producto: z.string().min(1),
  cantidadNueva: z.number().int().min(0),
  motivo: z.string().min(1),
  obligacionId: z.string().optional(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/pedidos/[id]/ajustar-cantidad — modificación autorizada de la
 * obligación original (contrato §1/§6), serializada bajo lock PEDIDO:{pedidoId}.
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
    const parsed = AjusteSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new AjustarPedidoCantidadUseCase()
    const result = await useCase.execute({
      pedidoId: id,
      producto: parsed.data.producto,
      cantidadNueva: parsed.data.cantidadNueva,
      motivo: parsed.data.motivo,
      autorizadoPorId: auth.user?.id ?? '',
      obligacionId: parsed.data.obligacionId,
      offlineId: parsed.data.offlineId,
    })

    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'AJUSTE_EXIGE_AUTORIZACION') return apiError('El ajuste exige autorización', 403)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error ajustando cantidad de pedido')
    return apiError('Error ajustando cantidad de pedido', 500)
  }
}
