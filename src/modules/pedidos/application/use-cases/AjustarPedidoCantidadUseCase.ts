/**
 * AjustarPedidoCantidadUseCase (FASE FINAL, ADR-OBLIGACION-001 / §6).
 *
 * "PedidoCantidadAjuste = Modificación autorizada de la obligación original,
 * serializada bajo lock del pedido" (contrato §1/§6 → lock `PEDIDO:pedidoId`).
 *
 * Registra el ajuste (cantidad original → nueva, con delta y autorización
 * auditable) de forma idempotente por `offlineId`.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { incrementMetric } from '@/lib/metrics'

export interface AjustarPedidoCantidadInput {
  pedidoId: string
  producto: string
  cantidadOriginal: number
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

      const delta = input.cantidadNueva - input.cantidadOriginal

      const ajuste = await tx.pedidoCantidadAjuste.create({
        data: {
          pedidoId: input.pedidoId,
          obligacionId: input.obligacionId ?? null,
          producto: input.producto,
          cantidadOriginal: input.cantidadOriginal,
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
