/**
 * Consecuencia económica del diferencial (N2, AGUA_BAMBU_N2_ALS_v2.0.md §3.4).
 *
 * - diferencial > 0: incrementa `Pedido.total`/`Factura.total` (misma
 *   `Pedido.numero` — nunca se crea un pedido nuevo). `totalPagado` no
 *   cambia → `saldo` sube por el mismo monto (satisface
 *   `chk_pedido_saldo_calc`). El cobro usa el flujo YA EXISTENTE de
 *   pagar-fiado/cartera — cero mecanismo de cobro nuevo.
 * - diferencial < 0: acredita `Cliente.saldoFavor`. NO se baja `Pedido.total`
 *   (violaría `chk_pedido_montopagado_le_total` si ya está pagado, y
 *   reescribiría el histórico) — mismo patrón ya probado en `#159`/`#184`.
 * - diferencial === 0: sin movimiento monetario.
 *
 * En todos los casos se registra un `PedidoCantidadAjuste` (reutiliza la
 * tabla existente, no crea una entidad "Diferencial" paralela) — incluso en
 * el caso 0, para trazabilidad ("se evaluó y no generó ajuste").
 */

import type { TransactionClient } from '@/lib/locks'

export interface AplicarDiferencialInput {
  pedidoId: string
  clienteId: string
  obligacionId: string
  producto: string
  /** Cantidad pendiente sobre la que se calculó el diferencial (para el registro, no cambia). */
  cantidadPendiente: number
  diferencial: number
  motivo: string
  autorizadoPorId: string
  offlineId?: string
}

export async function aplicarConsecuenciaEconomicaDiferencial(
  tx: TransactionClient,
  input: AplicarDiferencialInput,
): Promise<{ pedidoCantidadAjusteId: string }> {
  if (input.offlineId) {
    const existente = await tx.pedidoCantidadAjuste.findUnique({ where: { offlineId: input.offlineId } })
    if (existente) {
      return { pedidoCantidadAjusteId: existente.id }
    }
  }

  if (input.diferencial > 0) {
    await tx.pedido.update({
      where: { id: input.pedidoId },
      data: {
        total: { increment: input.diferencial },
        saldo: { increment: input.diferencial },
      },
    })

    const factura = await tx.factura.findUnique({ where: { pedidoId: input.pedidoId } })
    if (factura) {
      const nuevoTotal = Number(factura.total) + input.diferencial
      const nuevoSaldo = Number(factura.saldo) + input.diferencial
      await tx.factura.update({
        where: { id: factura.id },
        data: {
          total: nuevoTotal,
          saldo: nuevoSaldo,
          estado: nuevoSaldo <= 0
            ? 'PAGADA'
            : (Number(factura.montoPagado) > 0 ? 'PARCIAL' : 'EMITIDA'),
        },
      })
    }
  } else if (input.diferencial < 0) {
    await tx.cliente.update({
      where: { id: input.clienteId },
      data: { saldoFavor: { increment: Math.abs(input.diferencial) } },
    })
  }
  // diferencial === 0: sin movimiento monetario, solo el registro de abajo.

  const ajuste = await tx.pedidoCantidadAjuste.create({
    data: {
      pedidoId: input.pedidoId,
      obligacionId: input.obligacionId,
      producto: input.producto,
      // La cantidad NO cambia por un diferencial (es un ajuste de precio, no
      // de cantidad) — se registra igual (original === nueva, delta 0) para
      // que la tabla siga siendo la única fuente de "ajustes sobre una
      // obligación", cantidad o dinero.
      cantidadOriginal: input.cantidadPendiente,
      cantidadNueva: input.cantidadPendiente,
      delta: 0,
      motivo: input.motivo,
      autorizadoPorId: input.autorizadoPorId,
      montoDiferencial: input.diferencial,
      offlineId: input.offlineId ?? null,
    },
  })

  return { pedidoCantidadAjusteId: ajuste.id }
}
