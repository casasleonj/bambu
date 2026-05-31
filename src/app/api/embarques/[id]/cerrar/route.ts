import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { getNextNumero } from '@/lib/sequence'
import { resolverPrecio } from '@/lib/pricing'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { MetodoPago, EstadoEmbarque } from '@prisma/client'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { emptyStock, type StockSnapshot } from '@/lib/stock'
import { CerrarEmbarqueSchema } from '@/lib/validators'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
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

    const { pedidos: pedidosCuadre, ventasLibres, productos: productosRetorno, gastos: gastosData, dineroEntregado, justificacionDiscrepancia, obs } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify embarque exists and is ABIERTO
      const embarque = await tx.embarque.findUnique({
        where: { id },
        include: { pedidos: { include: { cliente: true, pagos: true, items: true, factura: true } }, trabajador: true, productos: true },
      })
      if (!embarque) throw new Error('EMBARQUE_NOT_FOUND')
      if (embarque.estado !== EstadoEmbarque.ABIERTO && embarque.estado !== EstadoEmbarque.EN_RUTA) throw new Error('EMBARQUE_YA_CERRADO')

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
            // FIX #9: Validate nuevoEmbarqueId exists and is open/en-ruta
            const nuevoEmbarque = await tx.embarque.findUnique({
              where: { id: cuadre.nuevoEmbarqueId },
              select: { id: true, estado: true, numero: true },
            })
            if (!nuevoEmbarque) {
              throw new Error(`EMBARQUE_DESTINO_NOT_FOUND: Embarque destino ${cuadre.nuevoEmbarqueId} no existe`)
            }
            if (nuevoEmbarque.estado !== EstadoEmbarque.ABIERTO && nuevoEmbarque.estado !== EstadoEmbarque.EN_RUTA) {
              throw new Error(`EMBARQUE_DESTINO_NO_DISPONIBLE: Embarque destino #${nuevoEmbarque.numero} está ${nuevoEmbarque.estado}`)
            }
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

        // ── PRECIOS: Congelados al crear el pedido, solo override explícito ───
        // Por defecto: usar precios originales del pedido (congelados al crear)
        // Esto protege contra cambios silenciosos si un admin modificó la tabla de precios
        // entre la creación del pedido y el cierre del embarque.
        const preciosOriginales = {
          pacaAgua: Number(pedido.precioPacaAgua),
          pacaHielo: Number(pedido.precioPacaHielo),
          botellonFab: Number(pedido.precioBotellonFab),
          botellonDom: Number(pedido.precioBotellonDom),
          bolsaAgua: Number(pedido.precioBolsaAgua),
          bolsaHielo: Number(pedido.precioBolsaHielo),
        }

        let precios: typeof preciosOriginales

        // FIX #2: Solo ADMIN puede override precios. REPARTIDOR usa precios originales.
        if (cuadre.preciosReales && session.user?.role === 'ADMIN') {
          // Override explícito: el usuario envió precios diferentes
          precios = cuadre.preciosReales
        } else {
          // Sin override o usuario no es ADMIN: usar precios originales congelados
          precios = preciosOriginales
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
        
        // Actualizar PedidoItem: cantEntrega + precio (sincronizar con Pedido.precio*)
        // Mapping de producto → key de precio
        const precioKeyMap: Record<string, keyof typeof precios> = {
          PACA_AGUA: 'pacaAgua',
          PACA_HIELO: 'pacaHielo',
          BOTELLON_FAB: 'botellonFab',
          BOTELLON_DOM: 'botellonDom',
          BOLSA_AGUA: 'bolsaAgua',
          BOLSA_HIELO: 'bolsaHielo',
        }

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
            data: {
              cantEntrega: itemUpd.cantidad,
              precio: precios[precioKeyMap[itemUpd.producto]] || 0,
            },
          })
        }
        
        // Log en Historial si los precios de cierre difieren de los originales
        const totalOriginal = Number(pedido.total)
        const deltaTotal = totalReal - totalOriginal
        if (cuadre.preciosReales && Math.abs(deltaTotal) > 0) {
          await tx.historial.create({
            data: {
              entidad: 'Pedido',
              registroId: pedido.id,
              accion: 'PRECIO_CIERRE',
              datos: JSON.stringify({
                pedidoNumero: pedido.numero,
                precioOriginal: totalOriginal,
                precioCierre: totalReal,
                delta: deltaTotal,
                deltaPct: totalOriginal > 0 ? ((deltaTotal / totalOriginal) * 100).toFixed(1) : '0',
                usuario: authResult.user?.email || 'unknown',
              }),
              usuarioId: (authResult.user as { id: string }).id,
            },
          })
        }

        // FIX #12: Validate pagos don't exceed totalReal (1% tolerance for rounding)
        const montoPagadoTotal = cuadre.pagos.reduce((sum, p) => sum + p.monto, 0)
        if (montoPagadoTotal > totalReal * 1.01) {
          throw new Error(`PAGOS_EXCEDIDOS: Pagos ($${montoPagadoTotal}) exceden total real ($${totalReal}) para pedido #${pedido.numero}`)
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
              estado: montoPagado >= totalReal ? 'PAGADA' : (montoPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
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

      // 4. Re-leer pedidos actualizados para conciliación precisa
      const pedidosActualesTx = await tx.pedido.findMany({
        where: { embarqueId: id },
      })

      const totalCargado: StockSnapshot = emptyStock()
      for (const prod of embarque.productos) {
        const key = prod.producto as keyof StockSnapshot
        if (key in totalCargado) totalCargado[key] = prod.cargadas
      }
      if (embarque.productos.length === 0) {
        totalCargado.PACA_AGUA = embarque.pacasAgua
        totalCargado.PACA_HIELO = embarque.pacasHielo
      }

      const totalEntregado: StockSnapshot = emptyStock()
      for (const p of pedidosActualesTx) {
        totalEntregado.PACA_AGUA += p.cPacaAguaEnt || 0
        totalEntregado.PACA_HIELO += p.cPacaHieloEnt || 0
        totalEntregado.BOTELLON += (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0)
        totalEntregado.BOLSA_AGUA += p.cBolsaAguaEnt || 0
        totalEntregado.BOLSA_HIELO += p.cBolsaHieloEnt || 0
      }
      for (const v of ventasLibres) {
        totalEntregado.PACA_AGUA += v.cPacaAgua || 0
        totalEntregado.PACA_HIELO += v.cPacaHielo || 0
        totalEntregado.BOTELLON += (v.cBotellonFab || 0) + (v.cBotellonDom || 0)
        totalEntregado.BOLSA_AGUA += v.cBolsaAgua || 0
        totalEntregado.BOLSA_HIELO += v.cBolsaHielo || 0
      }

      // 5. Calcular discrepancia por producto
      const retornoMap: Record<string, { devueltas: number; cambios: number; rotas: number }> = {}
      for (const pr of productosRetorno) {
        retornoMap[pr.producto] = { devueltas: pr.devueltas, cambios: pr.cambios, rotas: pr.rotas }
      }

      const discrepancias: Record<string, number> = {}
      let totalDiscrepancy = 0
      const productosKeys = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const
      for (const key of productosKeys) {
        const ret = retornoMap[key] || { devueltas: 0, cambios: 0, rotas: 0 }
        const disc = totalCargado[key] - totalEntregado[key] - ret.devueltas - ret.rotas
        discrepancias[key] = disc
        if (disc > 0) totalDiscrepancy += disc
      }

      // 6. Si hay discrepancia no justificada, crear descuento valuado por producto
      let descuento = null
      if (totalDiscrepancy > 0 && !justificacionDiscrepancia) {
        // FIX #1: Resolver precio individual por producto (antes todos usaban precio PACA_AGUA)
        const precioMap: Record<string, number> = {}
        for (const key of productosKeys) {
          const precioResult = await resolverPrecio(key, 1, 'DOMICILIO', null, null, tx)
          precioMap[key] = precioResult.precio
        }

        let montoTotal = 0
        const motivos: string[] = []
        for (const key of productosKeys) {
          if (discrepancias[key] > 0) {
            const precio = precioMap[key] ?? precioMap['PACA_AGUA']
            montoTotal += discrepancias[key] * Number(precio)
            motivos.push(`${discrepancias[key]} ${key}`)
          }
        }
        descuento = await tx.descuentoRepartidor.create({
          data: {
            embarqueId: id,
            trabajadorId: embarque.trabajadorId,
            monto: montoTotal,
            motivo: `Discrepancia conciliación: ${motivos.join(', ')}`,
            justificado: false,
          },
        })
      }

      // 7. Crear gastos del embarque
      const gastosCreados = []
      for (const gastoData of gastosData) {
        const gasto = await tx.gasto.create({
          data: {
            categoria: gastoData.categoria,
            descripcion: gastoData.nota || gastoData.categoria,
            monto: gastoData.monto,
            responsable: embarque.trabajadorId,
            notas: gastoData.nota,
            embarqueId: id,
            createdById: (authResult.user as { id: string }).id,
          },
        })
        gastosCreados.push(gasto)
      }

      // 8. Actualizar EmbarqueProducto con retornos
      for (const pr of productosRetorno) {
        const existing = await tx.embarqueProducto.findUnique({
          where: { embarqueId_producto: { embarqueId: id, producto: pr.producto } },
        })
        if (existing) {
          await tx.embarqueProducto.update({
            where: { id: existing.id },
            data: { devueltas: pr.devueltas, cambios: pr.cambios, rotas: pr.rotas },
          })
        } else {
          await tx.embarqueProducto.create({
            data: {
              embarqueId: id,
              producto: pr.producto,
              devueltas: pr.devueltas,
              cambios: pr.cambios,
              rotas: pr.rotas,
            },
          })
        }
      }

      // 9. Close embarque
      const embarqueCerrado = await tx.embarque.update({
        where: { id },
        data: {
          estado: EstadoEmbarque.CERRADO,
          horaLlegada: new Date(),
          dineroEntregado,
          obs: obs || embarque.obs,
        },
      })

      return {
        embarque: embarqueCerrado,
        pedidosActualizados,
        pedidosHijosCreados,
        ventasLibresCreadas,
        pagosRegistrados,
        gastosCreados,
        conciliacion: {
          totalCargado,
          totalEntregado,
          discrepancias,
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
        gastos: result.gastosCreados.length,
        discrepancia: result.conciliacion.totalDiscrepancy,
        dineroEntregado,
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
    if (error instanceof Error && error.message.startsWith('PAGOS_EXCEDIDOS')) {
      return apiError(error.message.replace('PAGOS_EXCEDIDOS: ', ''), 400)
    }
    if (error instanceof Error && error.message.startsWith('EMBARQUE_DESTINO_NOT_FOUND')) {
      return apiError(error.message.replace('EMBARQUE_DESTINO_NOT_FOUND: ', ''), 404)
    }
    if (error instanceof Error && error.message.startsWith('EMBARQUE_DESTINO_NO_DISPONIBLE')) {
      return apiError(error.message.replace('EMBARQUE_DESTINO_NO_DISPONIBLE: ', ''), 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error cerrando embarque:')
    return apiError('Error al cerrar embarque', 500)
  }
}