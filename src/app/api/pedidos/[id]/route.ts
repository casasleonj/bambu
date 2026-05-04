import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { PedidoUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

function getUserFromSession(authResult: any) {
  return { id: authResult.user?.id || '', role: authResult.user?.role }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const hasAccess = await requireOwnership('pedido', id, getUserFromSession(authResult))
  if (!hasAccess) return apiError('Forbidden', 403)
  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id },
      include: { cliente: true, embarque: true },
    })
    if (!pedido) return apiError('Not found', 404)
    return apiSuccess({ pedido })
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
    const parsed = PedidoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { ...parsed.data }

      // Al marcar como ENTREGADO, copiar cantidades pedidas a entregadas si no se especificaron
      if (parsed.data.estado === 'ENTREGADO') {
        const current = await tx.pedido.findUnique({ where: { id } })
        if (!current) {
          throw new Error('PEDIDO_NOT_FOUND')
        }
        if (parsed.data.cPacaAguaEnt === undefined) updateData.cPacaAguaEnt = current.cPacaAguaPed
        if (parsed.data.cPacaHieloEnt === undefined) updateData.cPacaHieloEnt = current.cPacaHieloPed
        if (parsed.data.cBotellonFabEnt === undefined) updateData.cBotellonFabEnt = current.cBotellonFabPed
        if (parsed.data.cBotellonDomEnt === undefined) updateData.cBotellonDomEnt = current.cBotellonDomPed
        if (parsed.data.cBolsaAguaEnt === undefined) updateData.cBolsaAguaEnt = current.cBolsaAguaPed
        if (parsed.data.cBolsaHieloEnt === undefined) updateData.cBolsaHieloEnt = current.cBolsaHieloPed
      }

      // Al cancelar, crear nota de crédito y ajustar saldos
      if (parsed.data.estado === 'CANCELADO') {
        const current = await tx.pedido.findUnique({ where: { id }, include: { pagos: true, factura: true } })
        if (!current) {
          throw new Error('PEDIDO_NOT_FOUND')
        }

        const totalPagado = current.pagos.reduce((sum, p) => sum + Number(p.monto), 0)

        // Crear nota de crédito si hay pagos registrados
        if (totalPagado > 0) {
          const nextNum = await tx.notaCredito.count() + 1
          const ncNumero = `NC-${nextNum.toString().padStart(5, '0')}`
          await tx.notaCredito.create({
            data: {
              numero: ncNumero,
              pedidoId: id,
              facturaId: current.factura?.id || null,
              monto: totalPagado,
              motivo: 'CANCELADO',
              creadoPor: authResult.user?.id || null,
            },
          })
        }

        // Anular factura asociada si existe
        if (current.factura) {
          await tx.factura.update({
            where: { id: current.factura.id },
            data: { estado: 'ANULADA', saldo: 0 },
          })
        }

        // Resetear totales del pedido
        updateData.totalPagado = 0
        updateData.saldo = 0
      }

      return tx.pedido.update({
        where: { id },
        data: updateData,
      })
    })

    await logAudit({
      entidad: 'Pedido',
      registroId: pedido.id,
      accion: 'UPDATE',
      datos: { numero: pedido.numero, estado: pedido.estado },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ pedido })
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating pedido:')
    return apiError('Error updating', 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    await prisma.pedido.update({
      where: { id },
      data: { estado: 'ANULADO' },
    })

    await logAudit({
      entidad: 'Pedido',
      registroId: id,
      accion: 'DELETE',
      datos: { estado: 'ANULADO' },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({})
  } catch (error) {
    return apiError('Error deleting', 500)
  }
}
