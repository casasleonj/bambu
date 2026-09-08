import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { PreviewPedidoSchema } from '@/lib/validators'
import { previewPedidoUseCase } from '@/modules/pedidos'

/**
 * POST /api/pedidos/preview — prepara una creación de Pedido SIN persistir ni
 * mutar nada. BRECHA §9.1 del blueprint (docs/pedidos/03-blueprint-experiencia-hub.md).
 * Contrato normativo: docs/pedidos/02-api-contract-pedidos.md.
 * Read-only: sin lock, sin transacción de escritura, sin offlineId, sin crear
 * ni modificar Cliente. El commit real (POST /api/pedidos) revalida todo.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const actorId = role.user?.id
  if (!actorId) return apiError('No autorizado', 401)

  try {
    const body = await request.json()
    const parsed = PreviewPedidoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const result = await previewPedidoUseCase.execute({ ...parsed.data, actorId })
    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('CLIENTE_NOT_FOUND')) {
        return apiError('Cliente no encontrado', 404, { code: 'CLIENTE_NOT_FOUND' })
      }
      if (error.message.startsWith('PEDIDO_ORIGEN_NOT_FOUND')) {
        return apiError('Pedido de origen no encontrado', 404, { code: 'PEDIDO_ORIGEN_NOT_FOUND' })
      }
      if (error.message.startsWith('PEDIDO_NOT_FOUND')) {
        return apiError('Pedido no encontrado', 404, { code: 'PEDIDO_NOT_FOUND' })
      }
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error en preview de pedido')
    return apiError('Error preparando el pedido', 500)
  }
}
