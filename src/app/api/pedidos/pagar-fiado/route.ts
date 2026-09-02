import { NextRequest } from 'next/server'
import { requireAuth as _requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { PagarFiadoSchema } from '@/lib/validators'
import { calcularEstadoPago, shouldFireCulminado } from '@/lib/pedido-utils'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { NotificationEventType } from '@/lib/notifications/event-types'
import { prisma } from '@/lib/prisma'
import { Money, calcularSaldo } from '@/shared/domain'
import { registrarReceivableEntry, detectarDivergencia, registrarDivergencia } from '@/lib/receivable-entry'
import { datosConfirmacionInicial, parseMetodosRequierenConfirmacion } from '@/lib/pago-confirmacion'
import { getConfig } from '@/lib/config'
import { isConsumidorFinalCanonical } from '@/lib/cliente-canonical'

export async function POST(request: NextRequest) {
  // FIX C-1: solo ADMIN/ASISTENTE pueden registrar pagos de fiado.
  // Antes, CUALQUIER usuario autenticado (incluso REPARTIDOR) podía mover
  // dinero aplicando abonos a cualquier cliente. Riesgo de fraude interno
  // y robo de caja. Ahora se valida el rol explícitamente.
  const authResult = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE])
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const parsed = PagarFiadoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos inválidos', 400)
    }

    const { clienteId, monto, metodo, offlineId } = parsed.data

    // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: métodos que nacen REPORTADO.
    const metodosConfirmacion = parseMetodosRequierenConfirmacion(
      await getConfig('METODOS_REQUIEREN_CONFIRMACION'),
    )

    // FIX F-N11: dedup por offlineId DENTRO del lock ABONO.
    // Antes: el check de pagos previos estaba AQUÍ (líneas 30-61 antes
    // del fix), FUERA del lock. Dos requests idénticos (mismo offlineId)
    // llegaban casi simultáneos, ambos pasaban el findMany ([]), ambos
    // entraban al lock. El lock serializa, pero el segundo request
    // re-lee pedidos fiados que el primero YA PAGÓ. Aplica más pagos
    // sobre los pedidos restantes o con saldo > 0 → doble descuento.
    //
    // Ahora: el check corre DENTRO del lock. Si los pagos ya existen,
    // se reconstruye el response y se retorna deduped: true sin hacer
    // trabajo wasted.
    const resultado = await withAdvisoryLock('CARTERA', clienteId, async (tx) => {
      // DEDUP DENTRO DEL LOCK
      if (offlineId) {
        const pagosPrevios = await tx.pago.findMany({
          where: { offlineId },
          orderBy: { createdAt: 'asc' },
        })
        if (pagosPrevios.length > 0) {
          const montoAplicadoPrevio = pagosPrevios.reduce(
            (sum: number, p: { monto: unknown }) => sum + Number(p.monto),
            0,
          )
          const pedidosInvolucrados = await tx.pedido.findMany({
            where: { id: { in: pagosPrevios.map((p: { pedidoId: string }) => p.pedidoId) } },
            select: { id: true, numero: true, saldo: true, factura: { select: { id: true, numero: true } } },
          })
          return {
            deduped: true as const,
            pagosAplicados: pedidosInvolucrados.map((p: { id: string; numero: number; saldo: unknown; factura: { id: string; numero: string } | null }) => ({
              pedidoId: p.id,
              numero: p.numero,
              facturaId: p.factura?.id,
              facturaNumero: p.factura?.numero,
              montoAplicado: pagosPrevios.find((pg: { pedidoId: string }) => pg.pedidoId === p.id)
                ? Number(pagosPrevios.find((pg: { pedidoId: string }) => pg.pedidoId === p.id)!.monto)
                : 0,
              saldoRestante: Number(p.saldo),
              abonoCreado: !!p.factura,
            })),
            montoAplicado: montoAplicadoPrevio,
            montoSobrante: Math.max(0, monto - montoAplicadoPrevio),
            saldoFavorAcreditado: isConsumidorFinalCanonical(clienteId)
              ? 0
              : Math.round(Math.max(0, monto - montoAplicadoPrevio) * 100) / 100,
            mensaje: 'Pago ya aplicado previamente (dedup offline)',
          }
        }
      }

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
      // Pedidos que este abono deja ENTREGADO + PAGADO por primera vez.
      // El query FIFO solo trae pedidos con saldo > 0, así que si un
      // pedido sale PAGADO del loop es una transición recién ocurrida
      // (nunca "ya estaba así") — dispara PEDIDO_CULMINADO sin riesgo
      // de doble aviso.
      const culminados: Array<{ pedidoId: string; numero: number }> = []

      // 2. Aplicar monto FIFO
      for (const pedido of pedidosFiados) {
        if (montoRestante <= 0) break

        const saldoPedido = Number(pedido.saldo)
        const montoAplicar = Math.min(montoRestante, saldoPedido)

        // Crear pago
        // ADR-PAGO-REPORTADO-CONFIRMADO-001: pago de fiado digital nace
        // REPORTADO hasta que el escritorio verifica que el dinero entró.
        await tx.pago.create({
          data: {
            pedidoId: pedido.id,
            metodo,
            monto: montoAplicar,
            offlineId: offlineId || null, // dedup offline-first
            ...datosConfirmacionInicial(metodo, metodosConfirmacion),
          },
        })

        const nuevoTotalPagado = Number(pedido.totalPagado) + montoAplicar
        const nuevoSaldo = calcularSaldo(
          Money.fromDecimal(Number(pedido.total)),
          Money.fromDecimal(nuevoTotalPagado)
        ).toDecimal()
        // G5.1: si el pedido fiado aún no se entregó y este cobro lo deja
        // pagado completo → ANTICIPADO (no PAGADO).
        const nuevoEstadoPago = calcularEstadoPago(Number(pedido.total), nuevoTotalPagado, pedido.estadoEntrega)

        // Actualizar pedido
        await tx.pedido.update({
          where: { id: pedido.id },
          data: {
            totalPagado: nuevoTotalPagado,
            saldo: nuevoSaldo,
            estadoPago: nuevoEstadoPago,
          },
        })

        // FASE 5 (ADR-MONETARIO-001, §12): proyección de auditoría en la MISMA tx.
        await registrarReceivableEntry(tx, {
          pedidoId: pedido.id,
          facturaId: pedido.factura?.id ?? null,
          clienteId,
          tipo: 'PAGO',
          monto: montoAplicar,
          saldoResultante: nuevoSaldo,
          totalPagadoResultante: nuevoTotalPagado,
          offlineId,
        })

        // Contrato §12: verifica que Pedido.saldo (canónico) y la proyección
        // recién escrita realmente coincidan -- guarda contra un bug futuro
        // que desincronice el `tx.pedido.update` de arriba de lo que se
        // registró en ReceivableEntry.
        const pedidoActualizado = await tx.pedido.findUnique({
          where: { id: pedido.id },
          select: { saldo: true },
        })
        const { divergencia, diferencia } = detectarDivergencia(
          Number(pedidoActualizado?.saldo ?? 0),
          nuevoSaldo,
        )
        if (divergencia) {
          registrarDivergencia({
            pedidoId: pedido.id,
            canonico: Number(pedidoActualizado?.saldo ?? 0),
            proyeccion: nuevoSaldo,
            diferencia,
          })
        }

        if (shouldFireCulminado(pedido.estadoEntrega, nuevoEstadoPago)) {
          culminados.push({ pedidoId: pedido.id, numero: pedido.numero })
        }

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

      // ADR-CORRECCION-MONETARIA-001 D.6 / Fase 2 §3.4: el sobrante tras aplicar
      // FIFO deja de "reportarse y perderse" — se acredita al `Cliente.saldoFavor`
      // dentro de la misma transacción, así queda disponible para el próximo
      // pedido (lo consume `CrearPedidoUseCase` vía `getSaldoFavor`).
      //
      // Redondeo a centavos: el loop resta Numbers de 2 decimales y puede dejar
      // un residuo de coma flotante (~1e-13) cuando el pago cubre la deuda exacta.
      // Sin redondear, `> 0` dispararía un increment de sub-centavo y un mensaje
      // "Sobrante $0".
      //
      // Nota de trazabilidad de caja: este crédito NO genera fila `Pago`/`Abono`,
      // así que el efectivo extra recibido no aparece en `CierreDia` (mismo
      // comportamiento que el sobrante de un pedido normal, "FIX Fase 2 §3.4").
      // Cerrar ese gap es parte del rediseño de cartera (PR-B), no de PR-A.
      let saldoFavorAcreditado = 0
      const sobrante = Math.round(montoRestante * 100) / 100
      // El canónico CONSUMIDOR_FINAL es compartido por todas las ventas anónimas
      // — acreditarle saldo a favor lo filtraría a la próxima venta anónima ajena.
      if (sobrante > 0 && !isConsumidorFinalCanonical(clienteId)) {
        await tx.cliente.update({
          where: { id: clienteId },
          data: { saldoFavor: { increment: sobrante } },
        })
        saldoFavorAcreditado = sobrante
      }

      // F1 (ADR-CONCURRENCIA-001 / contrato §51): la auditoría del hecho
      // financiero se escribe en la MISMA transacción que aplicó los pagos.
      // Antes corría post-commit, sin `await` y tragando el error → un fallo
      // de auditoría dejaba dinero movido sin evidencia. Ahora, si la
      // auditoría falla, todo el pago hace rollback atómico.
      await logAudit({
        entidad: 'Pedido',
        registroId: clienteId,
        accion: 'UPDATE',
        datos: { monto, metodo, pagosAplicados, saldoFavorAcreditado },
        usuarioId: authResult.user?.id,
      }, tx)

      return { pagosAplicados, montoRestante, culminados, saldoFavorAcreditado }
    })

    if (!resultado.deduped && resultado.pagosAplicados.length > 0) {
      publishRealtimeEvent('pago.created', clienteId).catch(() => {})
      const afectados = new Set(resultado.pagosAplicados.map((p) => p.pedidoId))
      afectados.forEach((pedidoId) => {
        publishRealtimeEvent('pedido.updated', pedidoId).catch(() => {})
      })

      void (async () => {
        const clienteInfo = await prisma.cliente
          .findUnique({ where: { id: clienteId }, select: { nombre: true } })
          .catch(() => null)

        void notifyEvent(NotificationEventType.ABONO_APLICADO, {
          title: 'Abono aplicado',
          body: `Se aplicó un abono de $${(monto - resultado.montoRestante).toLocaleString()}${clienteInfo ? ` a ${clienteInfo.nombre}` : ''}.`,
          url: `/clientes?openCliente=${clienteId}`,
          tag: offlineId ?? `abono-${clienteId}-${Date.now()}`,
        })
      })()

      resultado.culminados.forEach((c) => {
        void notifyEvent(NotificationEventType.PEDIDO_CULMINADO, {
          title: 'Pedido culminado',
          body: `Pedido #${c.numero} fue entregado y pagado en su totalidad.`,
          url: `/pedidos?openPedido=${c.pedidoId}`,
          tag: `pedido-culminado-${c.pedidoId}`,
        })
      })
    }

    return apiSuccess({
      // Si fue deduped, propagar la respuesta original; si no, la nueva
      ...(resultado.deduped
        ? {
            deduped: true,
            pagosAplicados: resultado.pagosAplicados,
            montoAplicado: resultado.montoAplicado,
            montoSobrante: resultado.montoSobrante,
            saldoFavorAcreditado: resultado.saldoFavorAcreditado,
            mensaje: resultado.mensaje,
          }
        : {
            pagosAplicados: resultado.pagosAplicados,
            montoAplicado: monto - resultado.montoRestante,
            montoSobrante: resultado.montoRestante,
            saldoFavorAcreditado: resultado.saldoFavorAcreditado,
            mensaje: resultado.saldoFavorAcreditado > 0
              ? `Pagado $${(monto - resultado.saldoFavorAcreditado).toLocaleString()}. Sobrante $${resultado.saldoFavorAcreditado.toLocaleString()} acreditado a saldo a favor.`
              : `Pagado completo $${monto.toLocaleString()}`,
          }),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'SIN_DEUDA') {
      return apiError('El cliente no tiene deudas pendientes', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error pagando fiado')
    return apiError('Error procesando el pago', 500)
  }
}
