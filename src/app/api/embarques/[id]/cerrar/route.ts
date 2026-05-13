import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { z } from 'zod'
import { getNextNumero } from '@/lib/sequence'
import { resolverPrecio, resolverPreciosPedido, type ProductCode, type Canal } from '@/lib/pricing'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { MetodoPago } from '@prisma/client'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

const ProductoEntregadoSchema = z.object({
  cPacaAguaEnt: z.number().int().min(0).default(0),
  cPacaHieloEnt: z.number().int().min(0).default(0),
  cBotellonFabEnt: z.number().int().min(0).default(0),
  cBotellonDomEnt: z.number().int().min(0).default(0),
  cBolsaAguaEnt: z.number().int().min(0).default(0),
  cBolsaHieloEnt: z.number().int().min(0).default(0),
})

const PreciosRealesSchema = z.object({
  pacaAgua: z.number().min(0).default(0),
  pacaHielo: z.number().min(0).default(0),
  botellonFab: z.number().min(0).default(0),
  botellonDom: z.number().min(0).default(0),
  bolsaAgua: z.number().min(0).default(0),
  bolsaHielo: z.number().min(0).default(0),
})

const PagoSchema = z.object({
  metodo: z.string(),
  monto: z.number().min(0),
})

const PedidoCuadreSchema = z.object({
  pedidoId: z.string().min(1),
  entregado: z.enum(['COMPLETO', 'PARCIAL', 'NO_ENTREGADO']),
  productosEntregados: ProductoEntregadoSchema,
  preciosReales: PreciosRealesSchema.optional(),
  pagado: z.enum(['COMPLETO', 'PARCIAL', 'NO_PAGADO']),
  pagos: z.array(PagoSchema).default([]),
  nuevoEmbarqueId: z.string().optional(),
})

const VentaLibreSchema = z.object({
  clienteId: z.string().min(1),
  cPacaAgua: z.number().int().min(0).default(0),
  cPacaHielo: z.number().int().min(0).default(0),
  cBotellonFab: z.number().int().min(0).default(0),
  cBotellonDom: z.number().int().min(0).default(0),
  cBolsaAgua: z.number().int().min(0).default(0),
  cBolsaHielo: z.number().int().min(0).default(0),
  pagos: z.array(PagoSchema).default([]),
  obs: z.string().optional(),
})

const CerrarEmbarqueSchema = z.object({
  pedidos: z.array(PedidoCuadreSchema),
  ventasLibres: z.array(VentaLibreSchema).optional().default([]),
  devueltasAgua: z.number().int().min(0).default(0),
  devueltasHielo: z.number().int().min(0).default(0),
  rotasAgua: z.number().int().min(0).default(0),
  rotasHielo: z.number().int().min(0).default(0),
  discrepancia: z.number().min(0).default(0),
  justificacionDiscrepancia: z.string().optional(),
  obs: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const parsed = CerrarEmbarqueSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { pedidos: pedidosCuadre, ventasLibres, devueltasAgua, devueltasHielo, rotasAgua, rotasHielo, justificacionDiscrepancia, obs } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify embarque exists and is ABIERTO
      const embarque = await tx.embarque.findUnique({
        where: { id },
        include: { pedidos: { include: { cliente: true, pagos: true, items: true, factura: true } }, trabajador: true },
      })
      if (!embarque) throw new Error('EMBARQUE_NOT_FOUND')
      if (embarque.estado !== 'ABIERTO') throw new Error('EMBARQUE_YA_CERRADO')

      const pedidosHijosCreados: Array<{ id: string; numero: number }> = []
      const pedidosActualizados: Array<{ id: string; estado: string }> = []
      const pagosRegistrados: Array<{ pedidoId: string; monto: number }> = []

      // 2. Process each pedido in cuadre
      for (const cuadre of pedidosCuadre) {
        const pedido = embarque.pedidos.find((p) => p.id === cuadre.pedidoId)
        if (!pedido) continue

        const entProd = cuadre.productosEntregados
        const montoPagado = cuadre.pagos.reduce((sum, p) => sum + p.monto, 0)

        if (cuadre.entregado === 'NO_ENTREGADO') {
          const updateData: any = {
            estadoEntrega: 'NO_ENTREGADO',
            estado: 'NO_ENTREGADO',
            embarqueId: null,
            cPacaAguaEnt: 0,
            cPacaHieloEnt: 0,
            cBotellonFabEnt: 0,
            cBotellonDomEnt: 0,
            cBolsaAguaEnt: 0,
            cBolsaHieloEnt: 0,
          }
          
          if (cuadre.nuevoEmbarqueId) {
            updateData.estadoEntrega = 'EN_RUTA'
            updateData.estado = 'EN_RUTA'
            updateData.embarqueId = cuadre.nuevoEmbarqueId
          }
          
          await tx.pedido.update({ where: { id: pedido.id }, data: updateData })
          
          // Resetear items
          for (const item of pedido.items) {
            await tx.pedidoItem.updateMany({
              where: { pedidoId: pedido.id, producto: item.producto },
              data: { cantEntrega: 0 },
            })
          }
          
          pedidosActualizados.push({ id: pedido.id, estado: updateData.estadoEntrega })
          continue
        }

        // Calcular precios reales
        let precios: { pacaAgua: number; pacaHielo: number; botellonFab: number; botellonDom: number; bolsaAgua: number; bolsaHielo: number }

        if (cuadre.preciosReales) {
          precios = cuadre.preciosReales
        } else {
          const items: Array<{ codigo: ProductCode; cantidad: number }> = [
            { codigo: 'PACA_AGUA', cantidad: entProd.cPacaAguaEnt },
            { codigo: 'PACA_HIELO', cantidad: entProd.cPacaHieloEnt },
            { codigo: 'BOTELLON', cantidad: entProd.cBotellonFabEnt + entProd.cBotellonDomEnt },
            { codigo: 'BOLSA_AGUA', cantidad: entProd.cBolsaAguaEnt },
            { codigo: 'BOLSA_HIELO', cantidad: entProd.cBolsaHieloEnt },
          ]
          const resueltos = await resolverPreciosPedido(items, pedido.canal as Canal, pedido.clienteId, tx)
          const priceMap: Record<string, number> = {}
          for (const pr of resueltos) priceMap[pr.codigo] = pr.precio
          precios = {
            pacaAgua: priceMap['PACA_AGUA'] || 0,
            pacaHielo: priceMap['PACA_HIELO'] || 0,
            botellonFab: pedido.canal === 'PUNTO' ? (priceMap['BOTELLON'] || 0) : 0,
            botellonDom: pedido.canal === 'DOMICILIO' ? (priceMap['BOTELLON'] || 0) : 0,
            bolsaAgua: priceMap['BOLSA_AGUA'] || 0,
            bolsaHielo: priceMap['BOLSA_HIELO'] || 0,
          }
        }

        const totalReal =
          precios.pacaAgua * entProd.cPacaAguaEnt +
          precios.pacaHielo * entProd.cPacaHieloEnt +
          precios.botellonFab * entProd.cBotellonFabEnt +
          precios.botellonDom * entProd.cBotellonDomEnt +
          precios.bolsaAgua * entProd.cBolsaAguaEnt +
          precios.bolsaHielo * entProd.cBolsaHieloEnt

        const estadoPago = calcularEstadoPago(totalReal, montoPagado)

        // Actualizar pedido
        await tx.pedido.update({
          where: { id: pedido.id },
          data: {
            estadoEntrega: 'ENTREGADO',
            estado: 'ENTREGADO',
            estadoPago,
            cPacaAguaEnt: entProd.cPacaAguaEnt,
            cPacaHieloEnt: entProd.cPacaHieloEnt,
            cBotellonFabEnt: entProd.cBotellonFabEnt,
            cBotellonDomEnt: entProd.cBotellonDomEnt,
            cBolsaAguaEnt: entProd.cBolsaAguaEnt,
            cBolsaHieloEnt: entProd.cBolsaHieloEnt,
            precioPacaAgua: precios.pacaAgua,
            precioPacaHielo: precios.pacaHielo,
            precioBotellonFab: precios.botellonFab,
            precioBotellonDom: precios.botellonDom,
            precioBolsaAgua: precios.bolsaAgua,
            precioBolsaHielo: precios.bolsaHielo,
            total: totalReal,
            totalPagado: montoPagado,
            saldo: totalReal - montoPagado,
          },
        })
        
        // Actualizar PedidoItem
        const itemUpdates = [
          { producto: 'PACA_AGUA', cantidad: entProd.cPacaAguaEnt },
          { producto: 'PACA_HIELO', cantidad: entProd.cPacaHieloEnt },
          { producto: 'BOTELLON_FAB', cantidad: entProd.cBotellonFabEnt },
          { producto: 'BOTELLON_DOM', cantidad: entProd.cBotellonDomEnt },
          { producto: 'BOLSA_AGUA', cantidad: entProd.cBolsaAguaEnt },
          { producto: 'BOLSA_HIELO', cantidad: entProd.cBolsaHieloEnt },
        ]
        
        for (const itemUpd of itemUpdates) {
          await tx.pedidoItem.updateMany({
            where: { pedidoId: pedido.id, producto: itemUpd.producto },
            data: { cantEntrega: itemUpd.cantidad },
          })
        }
        
        pedidosActualizados.push({ id: pedido.id, estado: 'ENTREGADO' })

        // Registrar pagos
        for (const pago of cuadre.pagos) {
          if (pago.monto > 0) {
            await tx.pago.create({
              data: { pedidoId: pedido.id, metodo: pago.metodo as MetodoPago, monto: pago.monto },
            })
            pagosRegistrados.push({ pedidoId: pedido.id, monto: pago.monto })
          }
        }

        // Actualizar factura
        if (pedido.factura) {
          await tx.factura.update({
            where: { id: pedido.factura.id },
            data: {
              total: totalReal,
              saldo: totalReal - montoPagado,
              estado: montoPagado >= totalReal ? 'PAGADA' : 'EMITIDA',
            },
          })
        }

        // Si PARCIAL, crear hijo
        if (cuadre.entregado === 'PARCIAL') {
          const faltanteAgua = pedido.cPacaAguaPed - entProd.cPacaAguaEnt
          const faltanteHielo = pedido.cPacaHieloPed - entProd.cPacaHieloEnt
          const faltanteBotFab = pedido.cBotellonFabPed - entProd.cBotellonFabEnt
          const faltanteBotDom = pedido.cBotellonDomPed - entProd.cBotellonDomEnt
          const faltanteBolAgua = pedido.cBolsaAguaPed - entProd.cBolsaAguaEnt
          const faltanteBolHielo = pedido.cBolsaHieloPed - entProd.cBolsaHieloEnt

          const hayFaltante =
            faltanteAgua > 0 || faltanteHielo > 0 || faltanteBotFab > 0 ||
            faltanteBotDom > 0 || faltanteBolAgua > 0 || faltanteBolHielo > 0

          if (hayFaltante) {
            const numeroHijo = await getNextNumero(tx, { model: 'pedido' })
            const totalHijo =
              precios.pacaAgua * faltanteAgua +
              precios.pacaHielo * faltanteHielo +
              precios.botellonFab * faltanteBotFab +
              precios.botellonDom * faltanteBotDom +
              precios.bolsaAgua * faltanteBolAgua +
              precios.bolsaHielo * faltanteBolHielo

            const hijo = await tx.pedido.create({
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
                createdById: (authResult.user as { id: string }).id,
                items: {
                  create: [
                    ...(faltanteAgua > 0 ? [{ producto: 'PACA_AGUA', cantPedido: faltanteAgua, cantEntrega: 0, precio: precios.pacaAgua, subtotal: precios.pacaAgua * faltanteAgua }] : []),
                    ...(faltanteHielo > 0 ? [{ producto: 'PACA_HIELO', cantPedido: faltanteHielo, cantEntrega: 0, precio: precios.pacaHielo, subtotal: precios.pacaHielo * faltanteHielo }] : []),
                    ...(faltanteBotFab > 0 ? [{ producto: 'BOTELLON_FAB', cantPedido: faltanteBotFab, cantEntrega: 0, precio: precios.botellonFab, subtotal: precios.botellonFab * faltanteBotFab }] : []),
                    ...(faltanteBotDom > 0 ? [{ producto: 'BOTELLON_DOM', cantPedido: faltanteBotDom, cantEntrega: 0, precio: precios.botellonDom, subtotal: precios.botellonDom * faltanteBotDom }] : []),
                    ...(faltanteBolAgua > 0 ? [{ producto: 'BOLSA_AGUA', cantPedido: faltanteBolAgua, cantEntrega: 0, precio: precios.bolsaAgua, subtotal: precios.bolsaAgua * faltanteBolAgua }] : []),
                    ...(faltanteBolHielo > 0 ? [{ producto: 'BOLSA_HIELO', cantPedido: faltanteBolHielo, cantEntrega: 0, precio: precios.bolsaHielo, subtotal: precios.bolsaHielo * faltanteBolHielo }] : []),
                  ],
                },
              },
            })

            pedidosHijosCreados.push({ id: hijo.id, numero: hijo.numero })
          }
        }
      }

      // 3. Crear ventas libres
      const ventasLibresCreadas: Array<{ id: string; numero: number }> = []
      for (const venta of ventasLibres) {
        const totalItems = venta.cPacaAgua + venta.cPacaHielo + venta.cBotellonFab + venta.cBotellonDom + venta.cBolsaAgua + venta.cBolsaHielo
        if (totalItems === 0) continue

        const totalPagado = venta.pagos.reduce((sum, p) => sum + p.monto, 0)
        const numeroVenta = await getNextNumero(tx, { model: 'pedido' })

        const botellonCant = venta.cBotellonFab + venta.cBotellonDom
        const [precioAgua, precioHielo, precioBot, precioBolAgua, precioBolHielo] = await Promise.all([
          resolverPrecio('PACA_AGUA', venta.cPacaAgua, 'DOMICILIO', null, null),
          resolverPrecio('PACA_HIELO', venta.cPacaHielo, 'DOMICILIO', null, null),
          resolverPrecio('BOTELLON', botellonCant, 'DOMICILIO', null, null),
          resolverPrecio('BOLSA_AGUA', venta.cBolsaAgua, 'DOMICILIO', null, null),
          resolverPrecio('BOLSA_HIELO', venta.cBolsaHielo, 'DOMICILIO', null, null),
        ])

        const totalVenta =
          (venta.cPacaAgua * precioAgua.precio) +
          (venta.cPacaHielo * precioHielo.precio) +
          (botellonCant * precioBot.precio) +
          (venta.cBolsaAgua * precioBolAgua.precio) +
          (venta.cBolsaHielo * precioBolHielo.precio)

        const estadoPago = calcularEstadoPago(totalVenta, totalPagado)

        const nuevaVenta = await tx.pedido.create({
          data: {
            numero: numeroVenta,
            clienteId: venta.clienteId,
            tipo: 'ENVIO',
            canal: 'DOMICILIO',
            origen: 'VENTA_LIBRE',
            estadoEntrega: 'ENTREGADO',
            estadoPago,
            estado: 'ENTREGADO',
            embarqueId: embarque.id,
            precioPacaAgua: precioAgua.precio,
            precioPacaHielo: precioHielo.precio,
            precioBotellonFab: 0,
            precioBotellonDom: precioBot.precio,
            precioBolsaAgua: precioBolAgua.precio,
            precioBolsaHielo: precioBolHielo.precio,
            cPacaAguaPed: venta.cPacaAgua,
            cPacaAguaEnt: venta.cPacaAgua,
            cPacaHieloPed: venta.cPacaHielo,
            cPacaHieloEnt: venta.cPacaHielo,
            cBotellonFabPed: venta.cBotellonFab,
            cBotellonFabEnt: venta.cBotellonFab,
            cBotellonDomPed: venta.cBotellonDom,
            cBotellonDomEnt: venta.cBotellonDom,
            cBolsaAguaPed: venta.cBolsaAgua,
            cBolsaAguaEnt: venta.cBolsaAgua,
            cBolsaHieloPed: venta.cBolsaHielo,
            cBolsaHieloEnt: venta.cBolsaHielo,
            total: totalVenta,
            totalPagado: totalPagado,
            saldo: totalVenta - totalPagado,
            obs: venta.obs || 'Venta libre en ruta',
            createdById: (authResult.user as { id: string }).id,
            items: {
              create: [
                ...(venta.cPacaAgua > 0 ? [{ producto: 'PACA_AGUA', cantPedido: venta.cPacaAgua, cantEntrega: venta.cPacaAgua, precio: precioAgua.precio, subtotal: precioAgua.precio * venta.cPacaAgua }] : []),
                ...(venta.cPacaHielo > 0 ? [{ producto: 'PACA_HIELO', cantPedido: venta.cPacaHielo, cantEntrega: venta.cPacaHielo, precio: precioHielo.precio, subtotal: precioHielo.precio * venta.cPacaHielo }] : []),
                ...(botellonCant > 0 ? [{ producto: 'BOTELLON', cantPedido: botellonCant, cantEntrega: botellonCant, precio: precioBot.precio, subtotal: precioBot.precio * botellonCant }] : []),
                ...(venta.cBolsaAgua > 0 ? [{ producto: 'BOLSA_AGUA', cantPedido: venta.cBolsaAgua, cantEntrega: venta.cBolsaAgua, precio: precioBolAgua.precio, subtotal: precioBolAgua.precio * venta.cBolsaAgua }] : []),
                ...(venta.cBolsaHielo > 0 ? [{ producto: 'BOLSA_HIELO', cantPedido: venta.cBolsaHielo, cantEntrega: venta.cBolsaHielo, precio: precioBolHielo.precio, subtotal: precioBolHielo.precio * venta.cBolsaHielo }] : []),
              ],
            },
          },
        })

        for (const pago of venta.pagos) {
          if (pago.monto > 0) {
            await tx.pago.create({
              data: { pedidoId: nuevaVenta.id, metodo: pago.metodo as MetodoPago, monto: pago.monto },
            })
          }
        }

        // SIEMPRE crear factura
        const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })
        const facturaClienteId = venta.clienteId === 'CONSUMIDOR_FINAL' ? 'CONSUMIDOR_FINAL' : venta.clienteId
        await tx.factura.create({
          data: {
            numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
            clienteId: facturaClienteId,
            pedidoId: nuevaVenta.id,
            subtotal: totalVenta,
            total: totalVenta,
            saldo: totalVenta - totalPagado,
            estado: totalPagado >= totalVenta ? 'PAGADA' : 'EMITIDA',
          },
        })

        ventasLibresCreadas.push({ id: nuevaVenta.id, numero: nuevaVenta.numero })
      }

      // 4. Calcular pacas cargadas vs entregadas para conciliación
      const totalPacasAgua = embarque.pedidos.reduce((sum, p) => sum + p.cPacaAguaPed, 0) +
        ventasLibres.reduce((sum, v) => sum + v.cPacaAgua, 0)
      const totalPacasHielo = embarque.pedidos.reduce((sum, p) => sum + p.cPacaHieloPed, 0) +
        ventasLibres.reduce((sum, v) => sum + v.cPacaHielo, 0)

      const totalEntregadoAgua = embarque.pedidos.reduce((sum, p) => sum + p.cPacaAguaEnt, 0)
      const totalEntregadoHielo = embarque.pedidos.reduce((sum, p) => sum + p.cPacaHieloEnt, 0)

      // 5. Calcular discrepancia
      const discrepancyAgua = totalPacasAgua - totalEntregadoAgua - devueltasAgua - rotasAgua
      const discrepancyHielo = totalPacasHielo - totalEntregadoHielo - devueltasHielo - rotasHielo
      const totalDiscrepancy = discrepancyAgua + discrepancyHielo

      // 6. Si hay discrepancia no justificada, crear descuento
      let descuento = null
      if (totalDiscrepancy > 0 && !justificacionDiscrepancia) {
        descuento = await tx.descuentoRepartidor.create({
          data: {
            embarqueId: id,
            trabajadorId: embarque.trabajadorId,
            monto: totalDiscrepancy * 2500, // precio promedio aproximado
            motivo: `Discrepancia conciliación: ${discrepancyAgua} agua, ${discrepancyHielo} hielo`,
            justificado: false,
          },
        })
      }

      // 7. Close embarque
      const embarqueCerrado = await tx.embarque.update({
        where: { id },
        data: {
          estado: 'CERRADO',
          horaLlegada: new Date(),
          pacasAgua: totalPacasAgua,
          pacasHielo: totalPacasHielo,
          devueltasAgua,
          devueltasHielo,
          rotasAgua,
          rotasHielo,
          obs: obs || embarque.obs,
        },
      })

      return {
        embarque: embarqueCerrado,
        pedidosActualizados,
        pedidosHijosCreados,
        ventasLibresCreadas,
        pagosRegistrados,
        conciliacion: {
          discrepancyAgua,
          discrepancyHielo,
          totalDiscrepancy,
          justificacionDiscrepancia: justificacionDiscrepancia || null,
        },
        descuento,
      }
    })

    logAudit({
      entidad: 'Embarque',
      registroId: id,
      accion: 'UPDATE',
      datos: {
        accion: 'CERRAR',
        pedidosProcesados: result.pedidosActualizados.length,
        hijosCreados: result.pedidosHijosCreados.length,
        ventasLibres: result.ventasLibresCreadas.length,
        discrepancia: result.conciliacion.totalDiscrepancy,
      },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'EMBARQUE_NOT_FOUND') {
      return apiError('Embarque no encontrado', 404)
    }
    if (error instanceof Error && error.message === 'EMBARQUE_YA_CERRADO') {
      return apiError('El embarque ya está cerrado', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error cerrando embarque:')
    return apiError('Error al cerrar embarque', 500)
  }
}