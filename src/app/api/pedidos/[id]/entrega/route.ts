import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { EntregaSchema } from '@/lib/validators'
import { puedeTransicionarEntrega, calcularEstadoPago } from '@/lib/pedido-utils'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { EstadoEntrega } from '@prisma/client'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = EntregaSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { tipo, itemsEntregados, pagos, nuevoEmbarqueId, fotoEntrega, gpsLat, gpsLng, codigoVisita } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id },
        include: { items: true, pagos: true, factura: true },
      })
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // Validar transición
      if (!puedeTransicionarEntrega(pedido.estadoEntrega as EstadoEntrega, tipo === 'NO_ENTREGADO' ? 'NO_ENTREGADO' : 'ENTREGADO')) {
        throw new Error('TRANSICION_INVALIDA')
      }

      const montoPagado = (pagos || []).reduce((sum, p) => sum + p.monto, 0)

      // Caso NO_ENTREGADO
      if (tipo === 'NO_ENTREGADO') {
        const updateData: any = {
          estadoEntrega: 'NO_ENTREGADO',
          estado: 'NO_ENTREGADO', // legacy
          embarqueId: null,
          fotoEntrega: fotoEntrega || null,
          gpsLat: gpsLat || null,
          gpsLng: gpsLng || null,
        }

        if (nuevoEmbarqueId) {
          updateData.estadoEntrega = 'EN_RUTA'
          updateData.estado = 'EN_RUTA'
          updateData.embarqueId = nuevoEmbarqueId
        }

        await tx.pedido.update({ where: { id }, data: updateData })

        // Resetear items entregados
        for (const item of pedido.items) {
          await tx.pedidoItem.updateMany({
            where: { pedidoId: id, producto: item.producto },
            data: { cantEntrega: 0 },
          })
        }

        return { pedido: { id, estadoEntrega: updateData.estadoEntrega, estadoPago: pedido.estadoPago }, hijo: null }
      }

      // COMPLETO o PARCIAL
      // Actualizar items entregados
      for (const itemEnt of itemsEntregados || []) {
        await tx.pedidoItem.updateMany({
          where: { pedidoId: id, producto: itemEnt.producto },
          data: { cantEntrega: itemEnt.cantidad },
        })
      }

      // Recalcular total con precios reales (cantEntrega * precio)
      const itemsActualizados = await tx.pedidoItem.findMany({ where: { pedidoId: id } })
      const totalReal = itemsActualizados.reduce((sum, it) => sum + Number(it.precio) * it.cantEntrega, 0)

      // Registrar pagos
      for (const pago of pagos || []) {
        if (pago.monto > 0) {
          await tx.pago.create({
            data: { pedidoId: id, metodo: pago.metodo as any, monto: pago.monto },
          })
        }
      }

      const totalPagadoNuevo = Number(pedido.totalPagado) + montoPagado
      const saldo = totalReal - totalPagadoNuevo
      const estadoPago = calcularEstadoPago(totalReal, totalPagadoNuevo)

      await tx.pedido.update({
        where: { id },
        data: {
          estadoEntrega: 'ENTREGADO',
          estado: 'ENTREGADO',
          estadoPago,
          total: totalReal,
          totalPagado: totalPagadoNuevo,
          saldo,
          fotoEntrega: fotoEntrega || null,
          gpsLat: gpsLat || null,
          gpsLng: gpsLng || null,
          codigoVisita: codigoVisita || null,
          // Legacy
          cPacaAguaEnt: itemsActualizados.find(i => i.producto === 'PACA_AGUA')?.cantEntrega || 0,
          cPacaHieloEnt: itemsActualizados.find(i => i.producto === 'PACA_HIELO')?.cantEntrega || 0,
          cBotellonFabEnt: pedido.canal === 'PUNTO' ? (itemsActualizados.find(i => i.producto === 'BOTELLON')?.cantEntrega || 0) : 0,
          cBotellonDomEnt: pedido.canal === 'DOMICILIO' ? (itemsActualizados.find(i => i.producto === 'BOTELLON')?.cantEntrega || 0) : 0,
          cBolsaAguaEnt: itemsActualizados.find(i => i.producto === 'BOLSA_AGUA')?.cantEntrega || 0,
          cBolsaHieloEnt: itemsActualizados.find(i => i.producto === 'BOLSA_HIELO')?.cantEntrega || 0,
        },
      })

      // Si PARCIAL, crear pedido hijo con faltante
      let hijo = null
      if (tipo === 'PARCIAL') {
        const faltantes = itemsActualizados
          .filter(i => i.cantPedido > i.cantEntrega)
          .map(i => ({
            producto: i.producto,
            cantidad: i.cantPedido - i.cantEntrega,
            precio: Number(i.precio),
          }))

        if (faltantes.length > 0) {
          const numeroHijo = await tx.pedido.count() + 1
          const totalHijo = faltantes.reduce((sum, f) => sum + f.precio * f.cantidad, 0)

          hijo = await tx.pedido.create({
            data: {
              numero: numeroHijo,
              clienteId: pedido.clienteId,
              tipo: pedido.tipo,
              canal: pedido.canal,
              origen: pedido.origen,
              estadoEntrega: 'PENDIENTE',
              estadoPago: 'PENDIENTE',
              estado: 'PENDIENTE',
              idOrigen: pedido.id,
              total: totalHijo,
              saldo: totalHijo,
              totalPagado: 0,
              obs: `Faltante de pedido #${pedido.numero}`,
              createdById: authResult.user?.id,
              items: {
                create: faltantes.map(f => ({
                  producto: f.producto,
                  cantPedido: f.cantidad,
                  cantEntrega: 0,
                  precio: f.precio,
                  subtotal: f.precio * f.cantidad,
                })),
              },
            },
          })
        }
      }

      // Actualizar factura
      if (pedido.factura) {
        await tx.factura.update({
          where: { id: pedido.factura.id },
          data: {
            total: totalReal,
            saldo,
            estado: saldo <= 0 ? 'PAGADA' : 'EMITIDA',
          },
        })
      }

      return { pedido: { id, estadoEntrega: 'ENTREGADO', estadoPago, saldo }, hijo }
    })

    logAudit({
      entidad: 'Pedido',
      registroId: id,
      accion: 'UPDATE',
      datos: { accion: 'ENTREGA', tipo, estadoEntrega: result.pedido.estadoEntrega, estadoPago: result.pedido.estadoPago },
      usuarioId: authResult.user?.id,
    })

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    if (error instanceof Error && error.message === 'TRANSICION_INVALIDA') {
      return apiError('Transición de estado no permitida', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error registrando entrega:')
    return apiError('Error registrando entrega')
  }
}