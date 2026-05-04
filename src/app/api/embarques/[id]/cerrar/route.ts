import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { z } from 'zod'
import { getNextNumero } from '@/lib/sequence'
import { resolverPrecio } from '@/lib/pricing'
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

    const { pedidos: pedidosCuadre, ventasLibres, devueltasAgua, devueltasHielo, rotasAgua, rotasHielo, obs } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify embarque exists and is ABIERTO
      const embarque = await tx.embarque.findUnique({
        where: { id },
        include: { pedidos: { include: { cliente: true, pagos: true } } },
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
          // No se entregó nada → volver a PENDIENTE, quitar de embarque
          const updateData: Record<string, unknown> = {
            estado: 'PENDIENTE',
            embarqueId: null,
            cPacaAguaEnt: 0,
            cPacaHieloEnt: 0,
            cBotellonFabEnt: 0,
            cBotellonDomEnt: 0,
            cBolsaAguaEnt: 0,
            cBolsaHieloEnt: 0,
          }
          
          // Reasignar a otro embarque si se especificó
          if (cuadre.nuevoEmbarqueId) {
            updateData.estado = 'EN_RUTA'
            updateData.embarqueId = cuadre.nuevoEmbarqueId
          }
          
          await tx.pedido.update({
            where: { id: pedido.id },
            data: updateData,
          })
          pedidosActualizados.push({ id: pedido.id, estado: cuadre.nuevoEmbarqueId ? 'EN_RUTA' : 'PENDIENTE' })
          continue
        }

        // Se entregó algo → calcular totales con precios reales
        const precios = cuadre.preciosReales || {
          pacaAgua: Number(pedido.precioPacaAgua),
          pacaHielo: Number(pedido.precioPacaHielo),
          botellonFab: Number(pedido.precioBotellonFab),
          botellonDom: Number(pedido.precioBotellonDom),
          bolsaAgua: Number(pedido.precioBolsaAgua),
          bolsaHielo: Number(pedido.precioBolsaHielo),
        }

        const totalReal =
          precios.pacaAgua * entProd.cPacaAguaEnt +
          precios.pacaHielo * entProd.cPacaHieloEnt +
          precios.botellonFab * entProd.cBotellonFabEnt +
          precios.botellonDom * entProd.cBotellonDomEnt +
          precios.bolsaAgua * entProd.cBolsaAguaEnt +
          precios.bolsaHielo * entProd.cBolsaHieloEnt

        // Update pedido with delivered quantities and real prices
        await tx.pedido.update({
          where: { id: pedido.id },
          data: {
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
            estado: 'ENTREGADO',
            totalPagado: montoPagado,
            saldo: totalReal - montoPagado,
          },
        })
        pedidosActualizados.push({ id: pedido.id, estado: 'ENTREGADO' })

        // Register payments (multiple)
        for (const pago of cuadre.pagos) {
          if (pago.monto > 0) {
            await tx.pago.create({
              data: {
                pedidoId: pedido.id,
                metodo: pago.metodo as MetodoPago,
                monto: pago.monto,
              },
            })
            pagosRegistrados.push({ pedidoId: pedido.id, monto: pago.monto })
          }
        }

        // If partial delivery, create child pedido with remaining
        if (cuadre.entregado === 'PARCIAL') {
          const faltanteAgua = pedido.cPacaAguaPed - entProd.cPacaAguaEnt
          const faltanteHielo = pedido.cPacaHieloPed - entProd.cPacaHieloEnt
          const faltanteBotFab = pedido.cBotellonFabPed - entProd.cBotellonFabEnt
          const faltanteBotDom = pedido.cBotellonDomPed - entProd.cBotellonDomEnt
          const faltanteBolAgua = pedido.cBolsaAguaPed - entProd.cBolsaAguaEnt
          const faltanteBolHielo = pedido.cBolsaHieloPed - entProd.cBolsaHieloEnt

          const hayFaltante =
            faltanteAgua > 0 ||
            faltanteHielo > 0 ||
            faltanteBotFab > 0 ||
            faltanteBotDom > 0 ||
            faltanteBolAgua > 0 ||
            faltanteBolHielo > 0

          if (hayFaltante) {
            const numeroHijo = await getNextNumero(tx, { model: 'pedido' })
            const hijo = await tx.pedido.create({
              data: {
                numero: numeroHijo,
                clienteId: pedido.clienteId,
                tipo: pedido.tipo,
                canal: pedido.canal,
                estado: 'PENDIENTE',
                idOrigen: pedido.id,
                cPacaAguaPed: faltanteAgua,
                cPacaHieloPed: faltanteHielo,
                cBotellonFabPed: faltanteBotFab,
                cBotellonDomPed: faltanteBotDom,
                cBolsaAguaPed: faltanteBolAgua,
                cBolsaHieloPed: faltanteBolHielo,
                precioPacaAgua: precios.pacaAgua,
                precioPacaHielo: precios.pacaHielo,
                precioBotellonFab: precios.botellonFab,
                precioBotellonDom: precios.botellonDom,
                precioBolsaAgua: precios.bolsaAgua,
                precioBolsaHielo: precios.bolsaHielo,
                total: 0,
                totalPagado: 0,
                saldo: 0,
                obs: `Faltante de pedido #${pedido.numero}`,
                createdById: (authResult.user as { id: string }).id,
              },
            })

            // Calculate total for child using real prices
            const totalHijo =
              precios.pacaAgua * faltanteAgua +
              precios.pacaHielo * faltanteHielo +
              precios.botellonFab * faltanteBotFab +
              precios.botellonDom * faltanteBotDom +
              precios.bolsaAgua * faltanteBolAgua +
              precios.bolsaHielo * faltanteBolHielo

            await tx.pedido.update({
              where: { id: hijo.id },
              data: { total: totalHijo, saldo: totalHijo },
            })

            pedidosHijosCreados.push({ id: hijo.id, numero: hijo.numero })
          }
        }
      }

      // 3. Create ventas libres
      const ventasLibresCreadas: Array<{ id: string; numero: number }> = []
      for (const venta of ventasLibres) {
        if (
          venta.cPacaAgua +
            venta.cPacaHielo +
            venta.cBotellonFab +
            venta.cBotellonDom +
            venta.cBolsaAgua +
            venta.cBolsaHielo ===
          0
        )
          continue

        const totalPagado = venta.pagos.reduce((sum, p) => sum + p.monto, 0)
        const numeroVenta = await getNextNumero(tx, { model: 'pedido' })

        // Resolve prices from pricing engine (ventas libres use DOMICILIO canal)
        const [precioAgua, precioHielo, precioBotFab, precioBotDom, precioBolAgua, precioBolHielo] = await Promise.all([
          resolverPrecio('PACA_AGUA', venta.cPacaAgua, 'DOMICILIO', null, null),
          resolverPrecio('PACA_HIELO', venta.cPacaHielo, 'DOMICILIO', null, null),
          resolverPrecio('BOTELLON_FAB', venta.cBotellonFab, 'DOMICILIO', null, null),
          resolverPrecio('BOTELLON_DOM', venta.cBotellonDom, 'DOMICILIO', null, null),
          resolverPrecio('BOLSA_AGUA', venta.cBolsaAgua, 'DOMICILIO', null, null),
          resolverPrecio('BOLSA_HIELO', venta.cBolsaHielo, 'DOMICILIO', null, null),
        ])

        const totalVenta =
          (venta.cPacaAgua * precioAgua.precio) +
          (venta.cPacaHielo * precioHielo.precio) +
          (venta.cBotellonFab * precioBotFab.precio) +
          (venta.cBotellonDom * precioBotDom.precio) +
          (venta.cBolsaAgua * precioBolAgua.precio) +
          (venta.cBolsaHielo * precioBolHielo.precio)

        const nuevaVenta = await tx.pedido.create({
          data: {
            numero: numeroVenta,
            clienteId: venta.clienteId,
            tipo: 'ENVIO',
            canal: 'DOMICILIO',
            estado: 'ENTREGADO',
            embarqueId: embarque.id,
            precioPacaAgua: precioAgua.precio,
            precioPacaHielo: precioHielo.precio,
            precioBotellonFab: precioBotFab.precio,
            precioBotellonDom: precioBotDom.precio,
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
          },
        })

        // Register payments
        for (const pago of venta.pagos) {
          if (pago.monto > 0) {
            await tx.pago.create({
              data: {
                pedidoId: nuevaVenta.id,
                metodo: pago.metodo as MetodoPago,
                monto: pago.monto,
              },
            })
          }
        }

        ventasLibresCreadas.push({ id: nuevaVenta.id, numero: nuevaVenta.numero })
      }

      // 4. Calculate pacas loaded from pedidos + ventas libres
      const totalPacasAgua = embarque.pedidos.reduce((sum, p) => sum + p.cPacaAguaPed, 0) +
        ventasLibres.reduce((sum, v) => sum + v.cPacaAgua, 0)
      const totalPacasHielo = embarque.pedidos.reduce((sum, p) => sum + p.cPacaHieloPed, 0) +
        ventasLibres.reduce((sum, v) => sum + v.cPacaHielo, 0)

      // 5. Close embarque
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
      }
    })

    await logAudit({
      entidad: 'Embarque',
      registroId: id,
      accion: 'UPDATE',
      datos: {
        accion: 'CERRAR',
        pedidosProcesados: result.pedidosActualizados.length,
        hijosCreados: result.pedidosHijosCreados.length,
        ventasLibres: result.ventasLibresCreadas.length,
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
