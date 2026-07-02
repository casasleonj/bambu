import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { CancelarSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { cancelarPedidoUseCase } from '@/modules/pedidos'
import { publishRealtimeEvent } from '@/lib/realtime'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params

  const user = (authResult as { user?: { id?: string; role?: string } }).user

  // FIX (C-SEC paridad con enviar/route.ts): REPARTIDOR solo puede cancelar
  // pedidos asignados a sus propios embarques. ADMIN/ASISTENTE no tienen esta
  // restricción.
  if (user?.role === 'REPARTIDOR' && user.id) {
    const hasOwnership = await requireOwnership('pedido', id, { id: user.id, role: user.role })
    if (!hasOwnership) {
      return apiError('No tiene permisos para cancelar este pedido', 403)
    }
  }

  try {
    const body = await request.json()
    const parsed = CancelarSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { motivo, offlineId } = parsed.data

    // FIX: el dedup por estado CANCELADO vive dentro del
    // CancelarPedidoUseCase (bajo lock NC). Paridad con AnularPedidoUseCase
    // (F-N21): dos requests idénticas retornan 200 idempotente en vez de 400.
    const result = await cancelarPedidoUseCase.execute({ pedidoId: id, motivo, offlineId })

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
      if (error.message.startsWith('No se puede cancelar')) return apiError(error.message, 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error cancelando pedido:')
    return apiError('Error cancelando pedido')
  }
}
