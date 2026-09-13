import { generateUUID } from '@/lib/uuid'
import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { VentaLibreSchema } from '@/lib/validators'
import { withAdvisoryLock, acquireAdvisoryLockTx } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { resolverPreciosPedido, type Canal, type ProductCode } from '@/lib/pricing'
import type { MetodoPago } from '@prisma/client'
import { calcularEstadoPago, puedeFiar } from '@/lib/pedido-utils'
import { normalizarPagos } from '@/modules/pedidos/domain/services/pagos-calculator.service'
import { GetFiadoStatusUseCase } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { buildPedidoLegacyFields } from '@/lib/pedido-legacy'
import { logAudit } from '@/lib/audit'
import { ROLES, CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ensureConsumidorFinalCanonical, isConsumidorFinalCanonical } from '@/lib/cliente-canonical'
import { logger } from '@/lib/logger'
import { uploadBase64Foto, isBase64Image } from '@/lib/storage'
import { getConfigBool, getConfig } from '@/lib/config'
import { publishRealtimeEvent } from '@/lib/realtime'
import { getFacturaEmpresaSnapshot } from '@/lib/factura-empresa'
import { clasificarVentaLibre } from '@/lib/venta-libre-clasificacion'
import { incrementMetric } from '@/lib/metrics'
import { registrarReceivableEntry } from '@/lib/receivable-entry'
import { datosConfirmacionInicial, parseMetodosRequierenConfirmacion } from '@/lib/pago-confirmacion'
import { OrigenPedido, EstadoEntrega } from '@prisma/client'

// F1 (Autoridad de Crédito, docs/AGUA_BAMBU_F1_DISENO_TECNICO_AUTORIDAD_CREDITO_v1.0.md):
// esta ruta vive fuera del composition root del módulo `pedidos` (usa `tx`
// crudo, no repos inyectados) — se instancia directo en vez de crear una
// fábrica solo por estética de arquitectura (decisión explícita del
// equipo). Los repos Prisma son stateless (tx se pasa por-llamada), así
// que una única instancia a nivel de módulo es segura de reutilizar.
const fiadoAuthority = new GetFiadoStatusUseCase(new PrismaPedidoRepository(), new PrismaClienteRepository())

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

    // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: "entregar ahora" vs "después". Gate
    // por flag durante el rollout: con el flag OFF, `entregado` se ignora.
    const ventaRutaPosteriorOn = process.env.NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR === 'true'
    const entregarAhora = !ventaRutaPosteriorOn || parsed.data.entregado !== false
    // Guard autoritativo de foto: el schema la salta si `entregado === false`,
    // pero con el flag OFF ese `false` se ignora → la foto vuelve a ser obligatoria.
    if (entregarAhora && (!fotoEntrega || fotoEntrega.length === 0)) {
      return apiError('Foto de entrega obligatoria', 400)
    }

    // FASE 7 (ADR-OFFLINE-001, §11): timestamps de la venta espontánea.
    const serverReceivedAt = new Date()
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : null
    const capturedAt = parsed.data.capturedAt ? new Date(parsed.data.capturedAt) : null
    const clasificacionTemporal = clasificarVentaLibre({
      occurredAt,
      capturedAt,
      serverReceivedAt,
    })
    // Métricas de observabilidad (§24): no bloquean la venta, solo la señalan.
    if (clasificacionTemporal === 'TARDIA') incrementMetric('venta_libre_tardia_count')
    if (clasificacionTemporal === 'SOSPECHOSA') incrementMetric('venta_libre_sospechosa_count')

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

    // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: qué métodos nacen REPORTADO (override
    // de `Config.METODOS_REQUIEREN_CONFIRMACION`; default = tabla del ADR).
    const metodosConfirmacion = parseMetodosRequierenConfirmacion(
      await getConfig('METODOS_REQUIEREN_CONFIRMACION'),
    )

    // Snapshot de datos de empresa: lectura simple fuera del lock.
    // Se guarda en la factura para que quede inmutable al momento de emisión.
    const empresaSnapshot = await getFacturaEmpresaSnapshot()

    // Upload base64 foto to Supabase Storage if present
    let fotoUrl = fotoEntrega
    if (fotoEntrega && isBase64Image(fotoEntrega)) {
      const fileName = `venta-libre/${offlineId || generateUUID()}.jpg`
      const uploadedUrl = await uploadBase64Foto(fotoEntrega, fileName)
      if (uploadedUrl) fotoUrl = uploadedUrl
    }

    // FASE 0 (ADR-CONCURRENCIA-001): lock `SECUENCIA:pedido` (paridad con el
    // resto de creadores de pedidos). La venta libre usa autoincrement para
    // Pedido.numero, pero comparte serialización con CrearPedido (MAX+1) para
    // no introducir colisiones de numeración.
    const result = await withAdvisoryLock('SECUENCIA', 'pedido', async (tx) => {
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
      const clienteFinalId = clienteId
      const esAnonimo = isConsumidorFinalCanonical(clienteId)
      const cliente = await tx.cliente.findUnique({ where: { id: clienteId } })

      if (!cliente && !esAnonimo) {
        throw new Error('CLIENTE_NOT_FOUND')
      }

      // FIX consumidor-final-duplicado: asegurar el cliente canónico antes
      // de crear el pedido. Si no existe, lo creamos atómicamente para evitar
      // FK violation en entornos sin seed/migración.
      if (esAnonimo) {
        await ensureConsumidorFinalCanonical(tx)
      }

      // 4. Forzar canal DOMICILIO
      const canal: Canal = 'DOMICILIO'

      // 5. Resolver precios
      const itemsParaPrecios = items
        .filter(i => i.cantidad > 0)
        .map(i => ({
          codigo: i.producto as ProductCode,
          cantidad: i.cantidad,
          precioManual: i.precioManual,
        }))

      const preciosResueltos = await resolverPreciosPedido(itemsParaPrecios, canal, clienteId, null, tx)
      const precioMap: Record<string, number> = {}
      for (const pr of preciosResueltos) {
        precioMap[pr.codigo] = pr.precio
      }

      const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)

      // FIX venta-libre-sobrepago: `totalPagado` (arriba) es la suma cruda de
      // los pagos capturados y puede superar `total` (el cliente paga con un
      // billete grande). Sin normalizar, `Pedido.saldo`/`totalPagado` violaban
      // los constraints `chk_pedido_saldo_nonneg`/`chk_pedido_montopagado_le_total`
      // (500 de Postgres). `normalizarPagos` acota lo aplicado al pedido y separa
      // el excedente — mismo patrón ya usado en `CrearPedidoUseCase`.
      const { pagosAplicados, excedente } = normalizarPagos(pagosData, total)
      const totalPagadoAplicado = pagosAplicados.reduce((sum, p) => sum + p.monto, 0)

      // 6. Validar pagos según tipo de cliente
      if (esAnonimo || (cliente && !puedeFiar(cliente, esAnonimo))) {
        if (totalPagado < total) {
          throw new Error('PAGO_COMPLETO_OBLIGATORIO')
        }
      }

      // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: la entrega define el estado.
      const estadoEntregaFinal = entregarAhora ? EstadoEntrega.ENTREGADO : EstadoEntrega.PENDIENTE
      // estadoPago PROYECTADO con el estado real: prepago + entrega pendiente → ANTICIPADO (G5.1).
      const estadoPago = calcularEstadoPago(total, totalPagadoAplicado, estadoEntregaFinal)

      // 6b. F1 (Autoridad de Crédito): consulta de pendientes + decisión
      // consolidadas en GetFiadoStatusUseCase — MISMA autoridad que usan
      // PreviewPedidoUseCase y CrearPedidoUseCase. Antes esta ruta
      // reimplementaba a mano tanto la consulta (tx.pedido.findMany, igual
      // a PrismaPedidoRepository.findPendingByCliente) como la decisión
      // (puedeCrearPedido). `puedeFiar` (arriba) sigue siendo un guard
      // propio de esta ruta, no duplicado en ningún otro lado.
      if (!esAnonimo && cliente && puedeFiar(cliente, esAnonimo)) {
        const fiadoStatus = await fiadoAuthority.execute({
          clienteId: cliente.id,
          operacion: { total, totalPagado: totalPagadoAplicado },
          tx,
        })
        if (fiadoStatus.errorDeuda) {
          throw new Error(`CLIENTE_DEBE: ${fiadoStatus.errorDeuda}`)
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
        producto: i.codigo,
        cantidad: i.cantidad,
        // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: si la entrega queda pendiente,
        // no hay unidades entregadas todavía (cantEntrega = 0).
        cantEntrega: entregarAhora ? i.cantidad : 0,
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
          canal,
          origen: OrigenPedido.VENTA_LIBRE,
          estadoEntrega: estadoEntregaFinal,
          estadoPago,
          estado: estadoEntregaFinal, // legacy
          // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: si se entrega después, el pedido
          // NO queda asignado a un embarque (queda planificable); pero el embarque
          // de origen se conserva para conciliar el `Pago` en su cierre (§0).
          embarqueId: entregarAhora ? embarqueId : null,
          embarqueOrigenId: embarqueId,
          total,
          totalPagado: totalPagadoAplicado,
          saldo: total - totalPagadoAplicado,
          obs: obs || (entregarAhora ? 'Venta libre en ruta' : 'Venta libre en ruta (entrega posterior)'),
          fotoEntrega: entregarAhora ? (fotoUrl || null) : null,
          gpsLat: gpsLat || null,
          gpsLng: gpsLng || null,
          offlineId: offlineId || null,
          occurredAt: occurredAt ?? null,
          capturedAt: capturedAt ?? null,
          serverReceivedAt,
          clasificacionTemporal,
          ...legacyFields,
          items: {
            create: itemsParaPrecios.map(i => ({
              producto: i.codigo,
              cantPedido: i.cantidad,
              cantEntrega: entregarAhora ? i.cantidad : 0,
              precio: precioMap[i.codigo] || 0,
              subtotal: (precioMap[i.codigo] || 0) * i.cantidad,
            })),
          },
        },
        include: { items: true },
      })

      // 9. Crear pagos
      // ADR-PAGO-REPORTADO-CONFIRMADO-001: un pago digital cobrado en ruta
      // nace REPORTADO (el escritorio verifica que el dinero entró); efectivo
      // nace CONFIRMADO (custodia física → cierre de embarque).
      for (const pago of pagosAplicados) {
        await tx.pago.create({
          data: {
            pedidoId: pedido.id,
            metodo: pago.metodo as MetodoPago,
            monto: pago.monto,
            // ADR-PAGO-EMBARQUE-CAPTURA-001: la venta libre se cobra EN la misión
            // `embarqueId` (embarque validado como del contexto de esta venta).
            embarqueId,
            ...datosConfirmacionInicial(pago.metodo, metodosConfirmacion),
          },
        })
      }

      // FIX venta-libre-sobrepago: excedente sobre `total` (ej. pago con billete
      // grande) se acredita como saldo a favor del cliente de la venta — mismo
      // criterio que `CrearPedidoUseCase`. Nota: si `clienteFinalId` es el
      // canónico `CONSUMIDOR_FINAL` (venta anónima), el crédito queda en esa
      // cuenta compartida; es el mismo comportamiento ya existente en
      // `CrearPedidoUseCase` hoy, no una regla nueva de esta corrección — sigue
      // registrado como brecha aparte en `docs/AGUA_BAMBU_INTEGRIDAD_COMERCIAL_CONVERGENCIA_v1.0.md` §3.
      if (excedente > 0) {
        await tx.cliente.update({
          where: { id: clienteFinalId },
          data: { saldoFavor: { increment: excedente } },
        })
      }

      // FASE FINAL (ADR-MONETARIO-001, §12): proyección de auditoría de los pagos.
      if (totalPagadoAplicado > 0) {
        await registrarReceivableEntry(tx, {
          pedidoId: pedido.id,
          clienteId: clienteFinalId,
          tipo: 'PAGO',
          monto: totalPagadoAplicado,
          saldoResultante: total - totalPagadoAplicado,
          totalPagadoResultante: totalPagadoAplicado,
          offlineId,
        })
      }

      // 10. SIEMPRE crear factura (Consumidor Final si anónimo)
      const facturaClienteId = esAnonimo ? CANONICAL_CONSUMIDOR_FINAL_ID : clienteFinalId

      // FASE 0 (ADR-CONCURRENCIA-001): lock de secuencia de factura en la
      // MISMA tx (multi-lock, orden SECUENCIA:pedido → SECUENCIA:factura).
      // Factura.numero ya usa secuencia atómica (factura_numero_seq), pero se
      // conserva el lock defensivo por paridad con POST /api/facturas.
      await acquireAdvisoryLockTx(tx, 'SECUENCIA', 'factura')
      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
          clienteId: facturaClienteId,
          pedidoId: pedido.id,
          subtotal: total,
          total,
          saldo: total - totalPagadoAplicado,
          montoPagado: totalPagadoAplicado,
          estado: totalPagadoAplicado >= total ? 'PAGADA' : (totalPagadoAplicado > 0 ? 'PARCIAL' : 'EMITIDA'),
          ...empresaSnapshot,
        },
      })

      return pedido
    })

    logAudit({
      entidad: 'Pedido',
      registroId: result.id,
      accion: 'CREATE',
      datos: { numero: result.numero, origen: 'VENTA_LIBRE', total: Number(result.total), embarqueId, entregado: entregarAhora },
      usuarioId: authResult.user?.id,
    })

    publishRealtimeEvent('pedido.created', result.id).catch(() => {})
    publishRealtimeEvent('embarque.updated', embarqueId).catch(() => {})

    return apiSuccess({ pedido: result }, 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'EMBARQUE_INVALIDO') return apiError('Embarque no válido o cerrado', 400)
      if (error.message === 'EMBARQUE_NO_PERTENECE') return apiError('No tienes acceso a este embarque', 403)
      if (error.message === 'CLIENTE_NOT_FOUND') return apiError('Cliente no encontrado', 404)
      if (error.message === 'PAGO_COMPLETO_OBLIGATORIO') return apiError('Cliente no verificado/anónimo debe pagar completo', 400)
      if (error.message.startsWith('CLIENTE_DEBE:')) return apiError(error.message.replace('CLIENTE_DEBE: ', ''), 400)
    }
    logger.error({ err: error instanceof Error ? error.stack || error.message : 'Unknown' }, 'Error creando venta libre:')
    return apiError('Error creando venta libre')
  }
}