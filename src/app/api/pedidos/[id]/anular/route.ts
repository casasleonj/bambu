import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { AnularSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { anularPedidoUseCase } from '@/modules/pedidos'
import { publishRealtimeEvent } from '@/lib/realtime'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = AnularSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { motivo, offlineId } = parsed.data

    // FIX F-N21 (hallazgo 2): el dedup por estado ANULADO se movió
    // al AnularPedidoUseCase (dentro del lock NC). Antes este check
    // estaba aquí, fuera del lock. Dos requests idénticos pasaban
    // el check y el segundo recibía 400 'YA_ANULADO' en vez de
    // 200 idempotente. Ahora el use case retorna { deduped: true }
    // y la route lo propaga al cliente.
    const result = await anularPedidoUseCase.execute({ pedidoId: id, motivo, offlineId })

    if (result.deduped) {
      logAudit({
        entidad: 'Pedido',
        registroId: id,
        accion: 'UPDATE',
        datos: { motivo, estado: result.pedido.estadoEntrega, deduped: true },
        usuarioId: (authResult as { user?: { id?: string } }).user?.id,
      }).catch(() => {})
      return apiSuccess(result, 200)
    }

    logAudit({
      entidad: 'Pedido',
      registroId: id,
      accion: 'UPDATE',
      datos: { motivo, estado: result.pedido.estadoEntrega },
      usuarioId: (authResult as { user?: { id?: string } }).user?.id,
    })

    publishRealtimeEvent('pedido.updated', id).catch(() => {})

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PEDIDO_NOT_FOUND') return apiError('Pedido no encontrado', 404)
      if (error.message === 'YA_ANULADO') return apiError('Pedido ya está anulado', 400)
      if (error.message.startsWith('Solo se pueden anular')) return apiError(error.message, 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error anulando pedido:')
    return apiError('Error anulando pedido')
  }
}
