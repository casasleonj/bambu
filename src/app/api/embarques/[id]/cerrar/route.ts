import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { getNextNumero } from '@/lib/sequence'
import { resolverPrecio } from '@/lib/pricing'
import type { ProductCode } from '@/lib/pricing'
import { MetodoPago } from '@prisma/client'
import { ROLES } from '@/lib/constants'

const ProductoEntregadoSchema = z.object({
  cPacaAguaEnt: z.number().int().min(0).default(0),
  cPacaHieloEnt: z.number().int().min(0).default(0),
  cBotellonFabEnt: z.number().int().min(0).default(0),
  cBotellonDomEnt: z.number().int().min(0).default(0),
  cBolsaAguaEnt: z.number().int().min(0).default(0),
  cBolsaHieloEnt: z.number().int().min(0).default(0),
})

const PagoSchema = z.object({
  metodo: z.string(),
  monto: z.number().min(0),
})

const PedidoCuadreSchema = z.object({
  pedidoId: z.string().min(1),
  entregado: z.enum(['COMPLETO', 'PARCIAL', 'NO_ENTREGADO']),
  productosEntregados: ProductoEntregadoSchema,
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
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const parsed = CerrarEmbarqueSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
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

        // Se entregó algo → calcular totales reales
        const totalEntregadoAgua = Number(pedido.precioPacaAgua) * entProd.cPacaAguaEnt
        const totalEntregadoHielo = Number(pedido.precioPacaHielo) * entProd.cPacaHieloEnt
        const totalEntregadoBotFab = Number(pedido.precioBotellonFab) * entProd.cBotellonFabEnt
        const totalEntregadoBotDom = Number(pedido.precioBotellonDom) * entProd.cBotellonDomEnt
        const totalEntregadoBolAgua = Number(pedido.precioBolsaAgua) * entProd.cBolsaAguaEnt
        const totalEntregadoBolHielo = Number(pedido.precioBolsaHielo) * entProd.cBolsaHieloEnt

        const totalReal =
          totalEntregadoAgua +
          totalEntregadoHielo +
          totalEntregadoBotFab +
          totalEntregadoBotDom +
          totalEntregadoBolAgua +
          totalEntregadoBolHielo

        // Update pedido with delivered quantities
        await tx.pedido.update({
          where: { id: pedido.id },
          data: {
            cPacaAguaEnt: entProd.cPacaAguaEnt,
            cPacaHieloEnt: entProd.cPacaHieloEnt,
            cBotellonFabEnt: entProd.cBotellonFabEnt,
            cBotellonDomEnt: entProd.cBotellonDomEnt,
            cBolsaAguaEnt: entProd.cBolsaAguaEnt,
            cBolsaHieloEnt: entProd.cBolsaHieloEnt,
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
                precioPacaAgua: pedido.precioPacaAgua,
                precioPacaHielo: pedido.precioPacaHielo,
                precioBotellonFab: pedido.precioBotellonFab,
                precioBotellonDom: pedido.precioBotellonDom,
                precioBolsaAgua: pedido.precioBolsaAgua,
                precioBolsaHielo: pedido.precioBolsaHielo,
                total: 0,
                totalPagado: 0,
                saldo: 0,
                obs: `Faltante de pedido #${pedido.numero}`,
                createdById: (authResult.user as { id: string }).id,
              },
            })

            // Calculate total for child
            const totalHijo =
              Number(pedido.precioPacaAgua) * faltanteAgua +
              Number(pedido.precioPacaHielo) * faltanteHielo +
              Number(pedido.precioBotellonFab) * faltanteBotFab +
              Number(pedido.precioBotellonDom) * faltanteBotDom +
              Number(pedido.precioBolsaAgua) * faltanteBolAgua +
              Number(pedido.precioBolsaHielo) * faltanteBolHielo

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

      // 4. Close embarque
      const embarqueCerrado = await tx.embarque.update({
        where: { id },
        data: {
          estado: 'CERRADO',
          horaLlegada: new Date(),
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

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof Error && error.message === 'EMBARQUE_NOT_FOUND') {
      return NextResponse.json({ error: 'Embarque no encontrado' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'EMBARQUE_YA_CERRADO') {
      return NextResponse.json({ error: 'El embarque ya está cerrado' }, { status: 400 })
    }
    console.error('Error cerrando embarque:', error)
    return NextResponse.json({ error: 'Error al cerrar embarque' }, { status: 500 })
  }
}
