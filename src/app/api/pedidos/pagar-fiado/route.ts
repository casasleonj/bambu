import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { PagarFiadoSchema } from '@/lib/validators'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const parsed = PagarFiadoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos inválidos', 400)
    }

    const { clienteId, monto, metodo, offlineId } = parsed.data

    // Offline-first: dedup — si ya existen Pagos con este offlineId, devolver el estado actual
    if (offlineId) {
      const pagosPrevios = await prisma.pago.findMany({
        where: { offlineId },
        orderBy: { createdAt: 'asc' },
      })
      if (pagosPrevios.length > 0) {
        // Reconstruir el resumen desde los pagos ya aplicados
        const montoAplicadoPrevio = pagosPrevios.reduce((sum, p) => sum + Number(p.monto), 0)
        const pedidosInvolucrados = await prisma.pedido.findMany({
          where: { id: { in: pagosPrevios.map(p => p.pedidoId) } },
          select: { id: true, numero: true, saldo: true, factura: { select: { id: true, numero: true } } },
        })
        return apiSuccess({
          deduped: true,
          pagosAplicados: pedidosInvolucrados.map(p => ({
            pedidoId: p.id,
            numero: p.numero,
            facturaId: p.factura?.id,
            facturaNumero: p.factura?.numero,
            montoAplicado: pagosPrevios.find(pg => pg.pedidoId === p.id)
              ? Number(pagosPrevios.find(pg => pg.pedidoId === p.id)!.monto)
              : 0,
            saldoRestante: Number(p.saldo),
            abonoCreado: !!p.factura,
          })),
          montoAplicado: montoAplicadoPrevio,
          montoSobrante: Math.max(0, monto - montoAplicadoPrevio),
          mensaje: 'Pago ya aplicado previamente (dedup offline)',
        })
      }
    }

    const resultado = await withAdvisoryLock('ABONO', async (tx) => {
      // 1. Buscar pedidos fiados del cliente, ordenados por fecha ASC (FIFO)
      const pedidosFiados = await tx.pedido.findMany({
        where: {
          clienteId,
          saldo: { gt: 0 },
          estadoEntrega: { not: 'ANULADO' },
        },
        orderBy: { fecha: 'asc' },
        include: { factura: true },
      })

      if (pedidosFiados.length === 0) {
        throw new Error('SIN_DEUDA')
      }

      let montoRestante = monto
      const pagosAplicados: Array<{
        pedidoId: string
        numero: number
        facturaId?: string
        facturaNumero?: string
        montoAplicado: number
        saldoRestante: number
        abonoCreado?: boolean
      }> = []

      // 2. Aplicar monto FIFO
      for (const pedido of pedidosFiados) {
        if (montoRestante <= 0) break

        const saldoPedido = Number(pedido.saldo)
        const montoAplicar = Math.min(montoRestante, saldoPedido)

        // Crear pago
        await tx.pago.create({
          data: {
            pedidoId: pedido.id,
            metodo,
            monto: montoAplicar,
            offlineId: offlineId || null, // dedup offline-first
          },
        })

        const nuevoTotalPagado = Number(pedido.totalPagado) + montoAplicar
        const nuevoSaldo = saldoPedido - montoAplicar
        const nuevoEstadoPago = calcularEstadoPago(Number(pedido.total), nuevoTotalPagado)

        // Actualizar pedido
        await tx.pedido.update({
          where: { id: pedido.id },
          data: {
            totalPagado: nuevoTotalPagado,
            saldo: nuevoSaldo,
            estadoPago: nuevoEstadoPago,
          },
        })

        // Actualizar factura con el abono (siempre, no solo cuando saldo llega a 0)
        if (pedido.factura) {
          const updatedFactura = await tx.factura.update({
            where: { id: pedido.factura.id },
            data: {
              saldo: { decrement: montoAplicar },
              montoPagado: { increment: montoAplicar },
            },
          })

          const facturaSaldo = Number(updatedFactura.saldo)
          const facturaMontoPagado = Number(updatedFactura.montoPagado)
          await tx.factura.update({
            where: { id: pedido.factura.id },
            data: {
              estado: facturaSaldo <= 0 ? 'PAGADA' : (facturaMontoPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
            },
          })
        }

        // Crear abono contable si existe factura
        if (pedido.factura) {
          const nextNum = await getNextNumero(tx, { model: 'abono', field: 'numero' })
          await tx.abono.create({
            data: {
              numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
              facturaId: pedido.factura.id,
              clienteId,
              pedidoId: pedido.id,
              monto: montoAplicar,
              metodoPago: metodo,
            },
          })
        }

        pagosAplicados.push({
          pedidoId: pedido.id,
          numero: pedido.numero,
          facturaId: pedido.factura?.id,
          facturaNumero: pedido.factura?.numero,
          montoAplicado: montoAplicar,
          saldoRestante: nuevoSaldo,
          abonoCreado: !!pedido.factura,
        })

        montoRestante -= montoAplicar
      }

      return { pagosAplicados, montoRestante }
    })

    logAudit({
      entidad: 'Pedido',
      registroId: clienteId,
      accion: 'UPDATE',
      datos: { monto, metodo, pagosAplicados: resultado.pagosAplicados },
      usuarioId: authResult.user?.id,
    })

    return apiSuccess({
      pagosAplicados: resultado.pagosAplicados,
      montoAplicado: monto - resultado.montoRestante,
      montoSobrante: resultado.montoRestante,
      mensaje: resultado.montoRestante > 0
        ? `Pagado $${(monto - resultado.montoRestante).toLocaleString()}. Sobrante: $${resultado.montoRestante.toLocaleString()}`
        : `Pagado completo $${monto.toLocaleString()}`,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'SIN_DEUDA') {
      return apiError('El cliente no tiene deudas pendientes', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error pagando fiado')
    return apiError('Error procesando el pago', 500)
  }
}
