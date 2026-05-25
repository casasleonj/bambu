import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { AnularSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'

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

    const { motivo, devolverStock } = parsed.data

    const result = await withAdvisoryLock('NC', async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id },
        include: { items: true, factura: true },
      })
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')
      if (pedido.estado === 'ANULADO') throw new Error('YA_ANULADO')
      if (pedido.estadoEntrega !== 'ENTREGADO') {
        throw new Error('SOLO_ENTREGADO')
      }

      // 1. Anular pedido padre
      await tx.pedido.update({
        where: { id },
        data: {
          estado: 'ANULADO',
          estadoEntrega: 'ANULADO',
          estadoPago: 'ANULADO',
          saldo: 0,
        },
      })

      // 2. Anular factura
      if (pedido.factura) {
        await tx.factura.update({
          where: { id: pedido.factura.id },
          data: {
            estado: 'ANULADA',
            saldo: 0,
          },
        })
      }

      // 4. Crear nota de crédito
      const nextNum = await getNextNumero(tx, { model: 'notaCredito' })
      const ncNumero = `NC-${nextNum.toString().padStart(5, '0')}`
      await tx.notaCredito.create({
        data: {
          numero: ncNumero,
          pedidoId: id,
          facturaId: pedido.factura?.id || null,
          monto: pedido.total,
          motivo,
          creadoPor: authResult.user?.id || null,
        },
      })

      // 5. Stock: NO se toca automáticamente
      const stockMessage = devolverStock
        ? 'Admin debe devolver productos manualmente al inventario'
        : 'Productos registrados como pérdida (no se devolvió stock)'

      return {
        pedido: { id, estado: 'ANULADO', estadoEntrega: 'ANULADO' },
        notaCredito: ncNumero,
        hijosAnulados: 0,
        stockMessage,
      }
    })

    logAudit({
      entidad: 'Pedido',
      registroId: id,
      accion: 'UPDATE',
      datos: { motivo, notaCredito: result.notaCredito, hijosAnulados: result.hijosAnulados },
      usuarioId: authResult.user?.id,
    })

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PEDIDO_NOT_FOUND') return apiError('Pedido no encontrado', 404)
      if (error.message === 'YA_ANULADO') return apiError('Pedido ya está anulado', 400)
      if (error.message === 'SOLO_ENTREGADO') return apiError('Solo se pueden anular pedidos ENTREGADOS', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error anulando pedido:')
    return apiError('Error anulando pedido')
  }
}