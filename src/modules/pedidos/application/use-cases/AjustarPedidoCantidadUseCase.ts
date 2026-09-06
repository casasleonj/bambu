/**
 * AjustarPedidoCantidadUseCase (FASE FINAL, ADR-OBLIGACION-001 / §6).
 *
 * G11 (decisión PO 2026-09-06, "A. Corrección"): este es EXCLUSIVAMENTE el
 * mecanismo de corrección de un Pedido existente — nunca de nueva demanda
 * comercial (eso es un Pedido nuevo con `pedidoOrigenId`, ver
 * `CrearPedidoUseCase`). "Corregir una obligación existente y crear una
 * nueva obligación son operaciones diferentes":
 *
 *   - Corrección: el Pedido original tenía un error de captura. No se crea
 *     venta ni Pedido nuevo. Se registra el ajuste sobre la obligación
 *     existente, conservando la trazabilidad del valor original
 *     (`PedidoCantidadAjuste.cantidadOriginal`).
 *   - Nueva demanda: el cliente pide más después. NUNCA se representa con
 *     este mecanismo — usar `CrearPedidoUseCase` con `pedidoOrigenId`.
 *
 * Dos guards impiden que esto se use fuera de su alcance (ambos, "C" y "D"
 * de la decisión):
 *
 *   1. `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA` — la cantidad ya entregada
 *      pertenece al cumplimiento histórico, nunca se modifica
 *      retroactivamente. Si `cantEntrega > 0` para el producto, esto ya no
 *      es "corregir un error de captura" — es demanda nueva.
 *   2. `CORRECCION_PEDIDO_CERRADO` — un Pedido cerrado (ENTREGADO/CANCELADO/
 *      ANULADO) no se reabre silenciosamente. La corrección de un pedido ya
 *      completado requiere el mecanismo de reversión monetaria existente
 *      (ADR-CORRECCION-MONETARIA-001), no este.
 *   3. `CORRECCION_GENERARIA_SOBREPAGO` — si la corrección (una disminución)
 *      dejaría `totalPagado > total`, hace falta primero una reversión
 *      monetaria (crédito a `saldoFavor` o similar) — este caso de uso NO
 *      inventa esa lógica, solo rechaza en vez de violar el invariante
 *      `chk_pedido_montopagado_le_total`.
 *
 * Con esos guards satisfechos, la corrección se aplica en vivo: actualiza
 * `PedidoItem.cantPedido`/`subtotal` (el precio histórico NUNCA cambia —
 * solo la cantidad), recalcula `Pedido.total`/`saldo`/`estadoPago` y
 * sincroniza `Factura`, todo dentro de la misma transacción que el registro
 * de auditoría — de forma idempotente por `offlineId`.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { incrementMetric } from '@/lib/metrics'
import { calcularEstadoPago } from '../../domain/services/pagos-calculator.service'

export interface AjustarPedidoCantidadInput {
  pedidoId: string
  producto: string
  cantidadNueva: number
  motivo: string
  autorizadoPorId: string
  obligacionId?: string
  offlineId?: string
}

export interface AjustarPedidoCantidadResult {
  ajusteId: string
  deduped: boolean
}

export class AjustarPedidoCantidadUseCase {
  async execute(input: AjustarPedidoCantidadInput): Promise<AjustarPedidoCantidadResult> {
    // §6: el agregado concurrentemente afectado es el pedido.
    return withAdvisoryLock('PEDIDO', input.pedidoId, async (tx) => {
      // Idempotencia: retry con el mismo offlineId → mismo ajuste.
      if (input.offlineId) {
        const existente = await tx.pedidoCantidadAjuste.findUnique({
          where: { offlineId: input.offlineId },
        })
        if (existente) {
          return { ajusteId: existente.id, deduped: true }
        }
      }

      // Modificación autorizada: autorización obligatoria (contrato §1).
      if (!input.autorizadoPorId) {
        incrementMetric('pedido_ajuste_concurrency_conflict_count')
        throw new Error('AJUSTE_EXIGE_AUTORIZACION')
      }

      const pedido = await tx.pedido.findUnique({
        where: { id: input.pedidoId },
        select: { estadoEntrega: true, total: true, totalPagado: true },
      })
      if (!pedido) {
        throw new Error('PEDIDO_NOT_FOUND')
      }

      // Guard D: un Pedido cerrado no se reabre silenciosamente.
      if (['ENTREGADO', 'CANCELADO', 'ANULADO'].includes(pedido.estadoEntrega)) {
        throw new Error(`CORRECCION_PEDIDO_CERRADO: estadoEntrega actual ${pedido.estadoEntrega}`)
      }

      // cantidadOriginal/cantEntrega se leen del estado real DENTRO del lock
      // -- nunca del cliente. El lock solo protege contra registros
      // duplicados si además protege que el "antes" registrado sea el
      // "antes" verdadero (contrato §6): sin esto, dos ajustes concurrentes
      // podrían partir de la misma cantidadOriginal fabricada en vez de
      // encadenarse correctamente.
      const item = await tx.pedidoItem.findFirst({
        where: { pedidoId: input.pedidoId, producto: input.producto },
        select: { id: true, cantPedido: true, cantEntrega: true, precio: true, subtotal: true },
      })
      if (!item) {
        throw new Error(`PEDIDO_ITEM_NOT_FOUND: ${input.producto}`)
      }

      // Guard C: la cantidad ya entregada es cumplimiento histórico, no se
      // toca retroactivamente. Si ya se entregó algo de este producto, un
      // pedido de más unidades es demanda nueva, no corrección.
      if (item.cantEntrega > 0) {
        throw new Error('CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA')
      }

      const cantidadOriginal = item.cantPedido
      const delta = input.cantidadNueva - cantidadOriginal
      const precioHistorico = Number(item.precio)
      const nuevoSubtotalItem = input.cantidadNueva * precioHistorico
      const deltaSubtotal = nuevoSubtotalItem - Number(item.subtotal)
      const nuevoTotalPedido = Number(pedido.total) + deltaSubtotal
      const totalPagado = Number(pedido.totalPagado)

      // Guard adicional (protege chk_pedido_montopagado_le_total): una
      // corrección a la baja no puede dejar totalPagado > total. Eso
      // requeriría una reversión monetaria (saldoFavor/reembolso) que este
      // caso de uso deliberadamente no inventa — se rechaza en vez de violar
      // el invariante o autocorregir en silencio.
      if (totalPagado > nuevoTotalPedido) {
        throw new Error(
          `CORRECCION_GENERARIA_SOBREPAGO: totalPagado ($${totalPagado}) quedaría por encima del nuevo total ($${nuevoTotalPedido}) — requiere reversión monetaria primero`,
        )
      }

      const nuevoSaldo = nuevoTotalPedido - totalPagado
      const nuevoEstadoPago = calcularEstadoPago(nuevoTotalPedido, totalPagado, pedido.estadoEntrega)

      await tx.pedidoItem.update({
        where: { id: item.id },
        data: { cantPedido: input.cantidadNueva, subtotal: nuevoSubtotalItem },
      })

      await tx.pedido.update({
        where: { id: input.pedidoId },
        data: { total: nuevoTotalPedido, saldo: nuevoSaldo, estadoPago: nuevoEstadoPago },
      })

      // Sincronizar Factura (todo Pedido nace con una, CrearPedidoUseCase
      // paso 9) — mismo patrón que ActualizarPedidoUseCase/N2.
      const factura = await tx.factura.findUnique({ where: { pedidoId: input.pedidoId } })
      if (factura) {
        const nuevoFacturaTotal = Number(factura.total) + deltaSubtotal
        const nuevoFacturaSaldo = nuevoFacturaTotal - Number(factura.montoPagado)
        await tx.factura.update({
          where: { id: factura.id },
          data: {
            total: nuevoFacturaTotal,
            saldo: nuevoFacturaSaldo,
            estado: nuevoFacturaSaldo <= 0
              ? 'PAGADA'
              : (Number(factura.montoPagado) > 0 ? 'PARCIAL' : 'EMITIDA'),
          },
        })
      }

      const ajuste = await tx.pedidoCantidadAjuste.create({
        data: {
          pedidoId: input.pedidoId,
          obligacionId: input.obligacionId ?? null,
          producto: input.producto,
          cantidadOriginal,
          cantidadNueva: input.cantidadNueva,
          delta,
          motivo: input.motivo,
          autorizadoPorId: input.autorizadoPorId,
          offlineId: input.offlineId ?? null,
        },
      })

      return { ajusteId: ajuste.id, deduped: false }
    })
  }
}
