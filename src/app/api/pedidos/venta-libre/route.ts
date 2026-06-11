import { generateUUID } from '@/lib/uuid'
import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { VentaLibreSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { resolverPreciosPedido, type Canal } from '@/lib/pricing'
import { calcularEstadoPago, puedeFiar, puedeCrearPedido } from '@/lib/pedido-utils'
import { buildPedidoLegacyFields } from '@/lib/pedido-legacy'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { uploadBase64Foto, isBase64Image } from '@/lib/storage'
import { getConfigBool } from '@/lib/config'
import { OrigenPedido, EstadoEntrega } from '@prisma/client'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = VentaLibreSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { clienteId, items, pagos, embarqueId, obs, fotoEntrega, gpsLat, gpsLng, offlineId } = parsed.data

    // BLOQUEAR_PRECIOS_REPARTIDOR — REPARTIDOR cannot set precioManual on any item.
    // Check `!== undefined` (not `> 0`) so any override is rejected. The schema
    // also rejects precioManual=0 with a validation error, but the route's own
    // defense must not depend on the schema's specifics.
    const bloquearPrecios = await getConfigBool('BLOQUEAR_PRECIOS_REPARTIDOR', false)
    if (bloquearPrecios && authResult.user?.role === 'REPARTIDOR') {
      const hasPrecioManual = items.some(i => i.precioManual !== undefined)
      if (hasPrecioManual) {
        return apiError('Los repartidores no pueden modificar precios', 403)
      }
    }
    const pagosData = pagos || []
    const totalPagado = pagosData.reduce((sum, p) => sum + p.monto, 0)

    // Upload base64 foto to Supabase Storage if present
    let fotoUrl = fotoEntrega
    if (fotoEntrega && isBase64Image(fotoEntrega)) {
      const fileName = `venta-libre/${offlineId || generateUUID()}.jpg`
      const uploadedUrl = await uploadBase64Foto(fotoEntrega, fileName)
      if (uploadedUrl) fotoUrl = uploadedUrl
    }

    const result = await withAdvisoryLock('PEDIDO', async (tx) => {
      // 1. Verificar embarque existe y está abierto
      const embarque = await tx.embarque.findUnique({
        where: { id: embarqueId },
        include: { trabajador: { include: { user: true } } },
      })
      if (!embarque || embarque.estado !== 'ABIERTO') {
        throw new Error('EMBARQUE_INVALIDO')
      }

      // 2. Verificar que el repartidor es dueño del embarque (si es repartidor)
      const userRole = authResult.user?.role
      const userId = authResult.user?.id
      if (userRole === 'REPARTIDOR') {
        const trabajador = await tx.trabajador.findFirst({
          where: { userId },
          select: { id: true },
        })
        if (!trabajador || embarque.trabajadorId !== trabajador.id) {
          throw new Error('EMBARQUE_NO_PERTENECE')
        }
      }

      // 3. Resolver cliente
      let clienteFinalId = clienteId
      const esAnonimo = clienteId === 'CONSUMIDOR_FINAL' || clienteId === 'CONSUMIDOR_FINAL'
      const cliente = await tx.cliente.findUnique({ where: { id: clienteId } })
      
      if (!cliente && !esAnonimo) {
        throw new Error('CLIENTE_NOT_FOUND')
      }

      // 4. Forzar canal DOMICILIO
      const canal: Canal = 'DOMICILIO'

      // 5. Resolver precios
      const itemsParaPrecios = items
        .filter(i => i.cantidad > 0)
        .map(i => ({
          codigo: i.producto as any,
          cantidad: i.cantidad,
          precioManual: i.precioManual,
        }))

      const preciosResueltos = await resolverPreciosPedido(itemsParaPrecios, canal, clienteId, tx)
      const precioMap: Record<string, number> = {}
      for (const pr of preciosResueltos) {
        precioMap[pr.codigo] = pr.precio
      }

      const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)

      // 6. Validar pagos según tipo de cliente
      if (esAnonimo || (cliente && !puedeFiar(cliente, esAnonimo))) {
        if (totalPagado < total) {
          throw new Error('PAGO_COMPLETO_OBLIGATORIO')
        }
      }

      const estadoPago = calcularEstadoPago(total, totalPagado)

      // 6b. Verificar límite de fiados si el pedido va a quedar con saldo
      if (!esAnonimo && cliente && puedeFiar(cliente, esAnonimo) && totalPagado < total) {
        const pedidosPendientes = await tx.pedido.findMany({
          where: {
            clienteId: cliente.id,
            estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] },
            estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] },
          },
          orderBy: { numero: 'asc' },
          select: { id: true, numero: true, saldo: true },
        })

        let limiteFiados = cliente.limitePedidosFiados ?? 3
        if (cliente.limitePedidosFiados == null) {
          const configLimite = await tx.config.findUnique({ where: { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT' } })
          if (configLimite) {
            limiteFiados = parseInt(configLimite.valor, 10) || 3
          }
        }

        const errorDeuda = puedeCrearPedido(cliente, pedidosPendientes, limiteFiados)
        if (errorDeuda) {
          throw new Error(`CLIENTE_DEBE: ${errorDeuda}`)
        }
      }

      // 7. Verificar offlineId no duplicado
      if (offlineId) {
        const existente = await tx.pedido.findUnique({ where: { offlineId } })
        if (existente) {
          // Ya existe, devolver el existente (upsert)
          return existente
        }
      }

      // 8. Crear pedido
      // Sprint 3 (C-2 Fase 1): legacy fields se computan desde items[]
      // vía buildPedidoLegacyFields() — única fuente de verdad.
      // Antes: 18 líneas hardcoded con split incorrecto del botellón
      // (siempre iba a Dom aunque el canal fuera PUNTO).
      const itemsParaLegacy = itemsParaPrecios.map(i => ({
        producto: i.codigo as any,
        cantidad: i.cantidad,
        precio: precioMap[i.codigo] || 0,
      }))
      const legacyFields = buildPedidoLegacyFields(
        itemsParaLegacy,
        canal as Canal,
      )

      const pedido = await tx.pedido.create({
        data: {
          clienteId: clienteFinalId,
          createdById: authResult.user?.id,
          tipo: 'ENVIO',
          canal,
          origen: OrigenPedido.VENTA_LIBRE,
          estadoEntrega: EstadoEntrega.ENTREGADO,
          estadoPago,
          estado: EstadoEntrega.ENTREGADO, // legacy
          embarqueId,
          total,
          totalPagado,
          saldo: total - totalPagado,
          obs: obs || 'Venta libre en ruta',
          fotoEntrega: fotoUrl || null,
          gpsLat: gpsLat || null,
          gpsLng: gpsLng || null,
          offlineId: offlineId || null,
          ...legacyFields,
          items: {
            create: itemsParaPrecios.map(i => ({
              producto: i.codigo,
              cantPedido: i.cantidad,
              cantEntrega: i.cantidad,
              precio: precioMap[i.codigo] || 0,
              subtotal: (precioMap[i.codigo] || 0) * i.cantidad,
            })),
          },
        },
        include: { items: true },
      })

      // 9. Crear pagos
      for (const pago of pagosData) {
        await tx.pago.create({
          data: {
            pedidoId: pedido.id,
            metodo: pago.metodo as any,
            monto: pago.monto,
          },
        })
      }

      // 10. SIEMPRE crear factura (Consumidor Final si anónimo)
      const facturaClienteId = esAnonimo ? 'CONSUMIDOR_FINAL' : clienteFinalId

      // FIX C-13: además del lock 'PEDIDO' (que ya cubre esta operación),
      // adquirir también 'FACTURA_NUM' específicamente alrededor de la
      // generación del número de factura. Esto previene race condition con
      // POST /api/facturas (que usa 'FACTURA_NUM' como lock principal) cuando
      // ambos corren en paralelo:
      //   - venta-libre A (bajo PEDIDO) genera factura #1500
      //   - /api/facturas B (bajo FACTURA_NUM) genera factura #1500 también
      // Sin este lock adicional, getNextNumero (count+1) en src/lib/sequence.ts:23
      // NO es atómico entre transacciones con locks DIFERENTES — solo entre
      // transacciones con el MISMO lock. La unique constraint en Factura.numero
      // (schema.prisma:728) eventualmente lo cacha, pero el 500 resultante es
      // confuso para el operador.
      // pg_advisory_xact_lock es re-entrante en la misma tx, así que adquirir
      // FACTURA_NUM dentro del lock PEDIDO no causa deadlock.
      const { LOCK_IDS } = await import('@/lib/locks')
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${LOCK_IDS.FACTURA_NUM})::text`
      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
          clienteId: facturaClienteId,
          pedidoId: pedido.id,
          subtotal: total,
          total,
          saldo: total - totalPagado,
          estado: totalPagado >= total ? 'PAGADA' : (totalPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
        },
      })

      return pedido
    })

    logAudit({
      entidad: 'Pedido',
      registroId: result.id,
      accion: 'CREATE',
      datos: { numero: result.numero, origen: 'VENTA_LIBRE', total: Number(result.total), embarqueId },
      usuarioId: authResult.user?.id,
    })

    return apiSuccess({ pedido: result }, 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'EMBARQUE_INVALIDO') return apiError('Embarque no válido o cerrado', 400)
      if (error.message === 'EMBARQUE_NO_PERTENECE') return apiError('No tienes acceso a este embarque', 403)
      if (error.message === 'CLIENTE_NOT_FOUND') return apiError('Cliente no encontrado', 404)
      if (error.message === 'PAGO_COMPLETO_OBLIGATORIO') return apiError('Cliente no verificado/anónimo debe pagar completo', 400)
      if (error.message.startsWith('CLIENTE_DEBE:')) return apiError(error.message.replace('CLIENTE_DEBE: ', ''), 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creando venta libre:')
    return apiError('Error creando venta libre')
  }
}