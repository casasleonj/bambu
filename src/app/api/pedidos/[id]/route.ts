import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { PedidoUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  actualizarPedidoUseCase,
  anularPedidoUseCase,
  cancelarPedidoUseCase,
} from '@/modules/pedidos'
import { PedidoId } from '@/modules/pedidos/domain/value-objects/PedidoId'
import { PedidoDTOMapper } from '@/modules/pedidos/application/dto/PedidoDTOMapper'
import { publishRealtimeEvent } from '@/lib/realtime'

function getUserFromSession(authResult: unknown) {
  return { id: (authResult as { user?: { id?: string } })?.user?.id || '', role: (authResult as { user?: { role?: string } })?.user?.role }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const hasAccess = await requireOwnership('pedido', id, getUserFromSession(authResult))
  if (!hasAccess) return apiError('Forbidden', 403)
  try {
    // Simple read — delegate to repository via module composition
    const { PrismaPedidoRepository } = await import('@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository')
    const repo = new PrismaPedidoRepository()
    const pedido = await repo.findById(PedidoId.from(id))
    if (!pedido) return apiError('Not found', 404)
    return apiSuccess({ pedido: PedidoDTOMapper.toResumen(pedido) })
  } catch (error) {
    return apiError('Error', 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const hasAccess = await requireOwnership('pedido', id, getUserFromSession(authResult))
  if (!hasAccess) return apiError('Forbidden', 403)
  try {
    const body = await request.json()
    // commit 0e: casoId opcional en el body para vincular este UPDATE
    // con un Caso (alerta antifraude). Se extrae ANTES de validar
    // con Zod porque el schema no incluye casoId (es metadata forense,
    // no dato de negocio).
    const casoId: string | null = typeof body?.casoId === 'string' ? body.casoId : null

    const parsed = PedidoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const result = await actualizarPedidoUseCase.execute({
      pedidoId: id,
      items: parsed.data.items?.map((i: { producto: string; cantidad: number; precioManual?: number }) => ({
        producto: i.producto as import('@/shared/domain').ProductCode,
        cantidad: i.cantidad,
        precioManual: i.precioManual,
      })),
      estadoEntrega: parsed.data.estado,
      obs: parsed.data.obs || undefined,
      actualizarCliente: parsed.data.actualizarCliente ? {
        direccion: parsed.data.actualizarCliente.direccion || undefined,
        barrio: parsed.data.actualizarCliente.barrio || undefined,
      } : undefined,
    })

    logAudit({
      entidad: 'Pedido',
      registroId: id,
      accion: 'UPDATE',
      datos: { numero: result.pedido.numero, estado: result.pedido.estadoEntrega },
      usuarioId: getUserFromSession(authResult).id,
      casoId,
    })

    publishRealtimeEvent('pedido.updated', id).catch(() => {})

    return apiSuccess({ pedido: result.pedido })
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating pedido:')
    return apiError('Error updating', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    // commit 0e: casoId opcional en el body
    let casoId: string | null = null
    try {
      const body = await request.json()
      casoId = typeof body?.casoId === 'string' ? body.casoId : null
    } catch {
      // body vacio o invalido: OK, casoId queda null
    }

    // Try anular (requires ENTREGADO), fallback to cancelar
    try {
      const result = await anularPedidoUseCase.execute({ pedidoId: id })
      logAudit({
        entidad: 'Pedido',
        registroId: id,
        accion: 'DELETE',
        datos: { estado: 'ANULADO' },
        usuarioId: getUserFromSession(authResult).id,
        casoId,
      })
      publishRealtimeEvent('pedido.updated', id).catch(() => {})
      return apiSuccess({ pedido: result.pedido })
    } catch (err) {
      // If anular fails because pedido is not ENTREGADO, try cancelar
      // But if it fails because pedido doesn't exist, return 404
      if (err instanceof Error && err.message === 'PEDIDO_NOT_FOUND') {
        return apiError('Pedido no encontrado', 404)
      }
      const result = await cancelarPedidoUseCase.execute({ pedidoId: id })
      logAudit({
        entidad: 'Pedido',
        registroId: id,
        accion: 'DELETE',
        datos: { estado: 'CANCELADO' },
        usuarioId: getUserFromSession(authResult).id,
        casoId,
      })
      publishRealtimeEvent('pedido.updated', id).catch(() => {})
      return apiSuccess({ pedido: result.pedido })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error deleting pedido:')
    return apiError('Error deleting', 500)
  }
}
