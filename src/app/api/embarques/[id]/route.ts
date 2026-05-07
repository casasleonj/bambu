import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { EmbarqueUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
    if (!hasAccess) return apiError('Forbidden', 403)
  try {
    const embarque = await prisma.embarque.findUnique({
      where: { id },
      include: {
        trabajador: true,
        ruta: true,
        pedidos: {
          include: { cliente: true, pagos: true },
        },
      },
    })
    if (!embarque) return apiError('Not found', 404)
    return apiSuccess({ embarque })
  } catch (error) {
    return apiError('Error', 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.REPARTIDOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)
  try {
    const body = await request.json()
    const parsed = EmbarqueUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { pedidoIds, obs, estado, horaLlegada, ...rest } = parsed.data

    if (estado === 'CERRADO') {
      return apiError('Use el flujo de cierre de ruta para cerrar embarques', 400)
    }

    const embarque = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { ...rest }
      if (obs !== undefined) updateData.obs = obs
      if (estado) updateData.estado = estado
      if (horaLlegada) updateData.horaLlegada = new Date(horaLlegada)

      if (pedidoIds && Array.isArray(pedidoIds)) {
        // Get current assigned pedido IDs to preserve them
        const currentPedidos = await tx.pedido.findMany({
          where: { embarqueId: id },
          select: { id: true },
        })
        const currentIds = currentPedidos.map(p => p.id)
        const allIds = [...new Set([...currentIds, ...pedidoIds])]

        // Assign all pedidos (existing + new) atomically
        await tx.pedido.updateMany({
          where: { id: { in: allIds }, embarqueId: { not: id } },
          data: { embarqueId: id },
        })
      }

      return tx.embarque.update({
        where: { id },
        data: updateData,
        include: {
          trabajador: true,
          pedidos: { include: { cliente: true } },
        },
      })
    })

    logAudit({
      entidad: 'Embarque',
      registroId: embarque.id,
      accion: 'UPDATE',
      datos: { numero: embarque.numero, estado: embarque.estado },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ embarque })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating embarque:')
    return apiError('Error updating', 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params

  try {
    const result = await prisma.$transaction(async (tx) => {
      const embarque = await tx.embarque.findUnique({
        where: { id },
        include: { pedidos: true },
      })

      if (!embarque) {
        throw new Error('EMBARQUE_NOT_FOUND')
      }

      if (embarque.estado === 'CERRADO') {
        throw new Error('EMBARQUE_CERRADO')
      }

      // Unassign all pedidos and return them to PENDIENTE
      if (embarque.pedidos.length > 0) {
        await tx.pedido.updateMany({
          where: { embarqueId: id },
          data: { embarqueId: null, estado: 'PENDIENTE' },
        })
      }

      // Soft-delete by marking as CANCELADO
      return tx.embarque.update({
        where: { id },
        data: { estado: 'CANCELADO' },
      })
    })

    logAudit({
      entidad: 'Embarque',
      registroId: result.id,
      accion: 'DELETE',
      datos: { numero: result.numero, estado: 'CANCELADO' },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({})
  } catch (error) {
    if (error instanceof Error && error.message === 'EMBARQUE_NOT_FOUND') {
      return apiError('Embarque no encontrado', 404)
    }
    if (error instanceof Error && error.message === 'EMBARQUE_CERRADO') {
      return apiError('No se puede cancelar un embarque cerrado', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error canceling embarque:')
    return apiError('Error al cancelar embarque', 500)
  }
}
