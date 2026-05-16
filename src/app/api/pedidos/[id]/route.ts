import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { PedidoUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'

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
      include: { cliente: true, embarque: true, items: true, pagos: true },
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

    const pedido = await withAdvisoryLock('PEDIDO', async (tx) => {
      const updateData: Record<string, unknown> = { ...parsed.data }

      // Si se envían items, sincronizar PedidoItem y legacy fields
      if (parsed.data.items && parsed.data.items.length > 0) {
        const current = await tx.pedido.findUnique({
          where: { id },
          include: { items: true },
        })
        if (!current) {
          throw new Error('PEDIDO_NOT_FOUND')
        }

        // Borrar items existentes
        await tx.pedidoItem.deleteMany({ where: { pedidoId: id } })

        // Crear nuevos items usando precios legacy actuales del pedido
        const precioMap: Record<string, number> = {
          PACA_AGUA: Number(current.precioPacaAgua || 0),
          PACA_HIELO: Number(current.precioPacaHielo || 0),
          BOTELLON: Number(current.precioBotellonFab || current.precioBotellonDom || 0),
          BOLSA_AGUA: Number(current.precioBolsaAgua || 0),
          BOLSA_HIELO: Number(current.precioBolsaHielo || 0),
        }

        const newItems = parsed.data.items
          .filter(i => i.cantidad > 0)
          .map(i => ({
            producto: i.producto,
            cantPedido: i.cantidad,
            cantEntrega: updateData.estado === 'ENTREGADO' ? i.cantidad : 0,
            precio: i.precioManual ?? precioMap[i.producto] ?? 0,
            subtotal: (i.precioManual ?? precioMap[i.producto] ?? 0) * i.cantidad,
          }))

        await tx.pedidoItem.createMany({
          data: newItems.map(i => ({ ...i, pedidoId: id })),
        })

        // Actualizar legacy fields
        const botellonCant = parsed.data.items.find(i => i.producto === 'BOTELLON')?.cantidad || 0
        updateData.cPacaAguaPed = parsed.data.items.find(i => i.producto === 'PACA_AGUA')?.cantidad || 0
        updateData.cPacaHieloPed = parsed.data.items.find(i => i.producto === 'PACA_HIELO')?.cantidad || 0
        updateData.cBotellonFabPed = current.canal === 'PUNTO' ? botellonCant : 0
        updateData.cBotellonDomPed = current.canal === 'DOMICILIO' ? botellonCant : 0
        updateData.cBolsaAguaPed = parsed.data.items.find(i => i.producto === 'BOLSA_AGUA')?.cantidad || 0
        updateData.cBolsaHieloPed = parsed.data.items.find(i => i.producto === 'BOLSA_HIELO')?.cantidad || 0

        // Recalcular total
        const nuevoTotal = newItems.reduce((sum, i) => sum + i.subtotal, 0)
        updateData.total = nuevoTotal
        updateData.saldo = nuevoTotal - Number(current.totalPagado || 0)
      }

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

        const totalPagado = current.pagos.reduce((sum: number, p: { monto: number }) => sum + Number(p.monto), 0)

        // Crear nota de crédito si hay pagos registrados
        if (totalPagado > 0) {
          const nextNum = await getNextNumero(tx, { model: 'notaCredito' })
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

      // Al desasignar de embarque (sin cambiar estado explicitamente), volver a PENDIENTE
      if (parsed.data.embarqueId === null && parsed.data.estado === undefined) {
        updateData.estado = 'PENDIENTE'
      }

      // Actualizar observaciones si se enviaron
      if (parsed.data.obs !== undefined) {
        updateData.obs = parsed.data.obs
      }

      // Sincronizar estadoEntrega con estado legacy para mantener consistencia
      if (updateData.estado) {
        updateData.estadoEntrega = updateData.estado
      }

      // Quitar 'items' porque es relación, no campo escalar
      delete updateData.items

      // Actualizar dirección/barrio del cliente si se editó
      if (parsed.data.actualizarCliente) {
        const pedidoActual = await tx.pedido.findUnique({
          where: { id },
          select: { clienteId: true },
        })
        if (pedidoActual && pedidoActual.clienteId !== 'CONSUMIDOR_FINAL') {
          await tx.cliente.update({
            where: { id: pedidoActual.clienteId },
            data: {
              direccion: parsed.data.actualizarCliente.direccion,
              barrio: parsed.data.actualizarCliente.barrio,
            },
          })
        }
      }

      return tx.pedido.update({
        where: { id },
        data: updateData,
      })
    })

    logAudit({
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

    logAudit({
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
