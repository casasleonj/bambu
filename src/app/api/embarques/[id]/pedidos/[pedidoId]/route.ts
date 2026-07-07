import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { publishRealtimeEvent } from '@/lib/realtime'

/**
 * DELETE /api/embarques/[id]/pedidos/[pedidoId]
 *
 * Quita un pedido de un embarque y lo devuelve a estado PENDIENTE.
 * Solo ADMIN/ASISTENTE pueden ejecutar esta acción.
 * El embarque debe estar ABIERTO o EN_RUTA (no CERRADO/CANCELADO).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; pedidoId: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id, pedidoId } = await params
  const session = authResult as { user?: { id?: string; role?: string } }

  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const embarque = await tx.embarque.findUnique({
        where: { id },
        select: { id: true, estado: true, numero: true },
      })
      if (!embarque) throw new Error('EMBARQUE_NOT_FOUND')
      if (embarque.estado === 'CERRADO' || embarque.estado === 'CANCELADO') {
        throw new Error('EMBARQUE_NOT_EDITABLE')
      }

      const pedido = await tx.pedido.findUnique({
        where: { id: pedidoId },
        select: { id: true, embarqueId: true, numero: true, estadoEntrega: true },
      })
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')
      if (pedido.embarqueId !== id) throw new Error('PEDIDO_NO_PERTENECE')
      if (pedido.estadoEntrega === 'ENTREGADO' || pedido.estadoEntrega === 'ANULADO' || pedido.estadoEntrega === 'CANCELADO') {
        throw new Error('PEDIDO_TERMINAL')
      }

      const updated = await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          embarqueId: null,
          estado: 'PENDIENTE',
          estadoEntrega: 'PENDIENTE',
        },
        select: { id: true, numero: true, estadoEntrega: true },
      })

      return { embarque, pedido: updated }
    })

    logAudit({
      entidad: 'Embarque',
      registroId: id,
      accion: 'UPDATE',
      datos: { accion: 'REMOVER_PEDIDO', pedidoId, pedidoNumero: result.pedido.numero },
      usuarioId: session.user?.id,
    })

    publishRealtimeEvent('pedido.updated', pedidoId).catch(() => {})
    publishRealtimeEvent('embarque.updated', id).catch(() => {})

    return apiSuccess({ embarqueId: id, pedidoId, estadoEntrega: result.pedido.estadoEntrega })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    if (message === 'EMBARQUE_NOT_FOUND') return apiError('Embarque no encontrado', 404)
    if (message === 'EMBARQUE_NOT_EDITABLE') return apiError('El embarque está cerrado o cancelado', 400)
    if (message === 'PEDIDO_NOT_FOUND') return apiError('Pedido no encontrado', 404)
    if (message === 'PEDIDO_NO_PERTENECE') return apiError('El pedido no pertenece a este embarque', 400)
    if (message === 'PEDIDO_TERMINAL') return apiError('No se puede remover un pedido ya entregado/anulado/cancelado', 400)
    logger.error({ err: message, embarqueId: id, pedidoId }, 'Error removiendo pedido de embarque')
    return apiError('Error removiendo pedido del embarque', 500)
  }
}
