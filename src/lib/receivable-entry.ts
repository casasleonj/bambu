/**
 * ReceivableEntry — proyección de auditoría de cartera (FASE 5, ADR-MONETARIO-001).
 *
 * Contrato §12:
 * - `Pedido.saldo`/`totalPagado` son la fuente canónica.
 * - `ReceivableEntry.saldoResultante` es SOLO un snapshot/proyección derivada,
 *   generado en la MISMA transacción del Pago/Abono.
 * - Nunca se calcula como ledger independiente.
 * - Si hay divergencia proyección vs canónico: NO autocorregir, NO inventar,
 *   NO alterar histórico → registrar `DUAL_WRITE_DIVERGENCE` + métrica.
 */

import type { Prisma } from '@prisma/client'
import { incrementMetric } from './metrics'
import { logger } from './logger'

// ADR-CORRECCION-MONETARIA-001: REVERSION compensa un PAGO/ABONO previo
// (corrección de abono, o anulación/cancelación de pedido pagado). Toda
// agregación de cartera que sume PAGO|ABONO debe restar REVERSION.
export type ReceivableTipo = 'PAGO' | 'ABONO' | 'REVERSION'

export interface ReceivableEntryInput {
  pedidoId?: string | null
  facturaId?: string | null
  clienteId: string
  tipo: ReceivableTipo
  monto: number
  saldoResultante: number
  totalPagadoResultante: number
  offlineId?: string | null
}

/**
 * Genera la proyección en la MISMA transacción del hecho monetario (contrato §12).
 */
export async function registrarReceivableEntry(
  tx: Prisma.TransactionClient,
  input: ReceivableEntryInput,
): Promise<void> {
  await tx.receivableEntry.create({
    data: {
      pedidoId: input.pedidoId ?? null,
      facturaId: input.facturaId ?? null,
      clienteId: input.clienteId,
      tipo: input.tipo,
      monto: input.monto,
      saldoResultante: input.saldoResultante,
      totalPagadoResultante: input.totalPagadoResultante,
      offlineId: input.offlineId ?? null,
    },
  })
}

/**
 * ADR-CORRECCION-MONETARIA-001 D.4 — al anular/cancelar un pedido pagado, emite
 * UNA `ReceivableEntry REVERSION` que compensa EXACTAMENTE lo que quedaba
 * proyectado para ese pedido: `sum(PAGO + ABONO) - sum(REVERSION previas)`.
 *
 * Revertir por ese neto (y no por `Pedido.totalPagado`) es lo correcto porque
 * hay caminos de cobro que mueven `totalPagado` SIN emitir un `PAGO`
 * (`ProcesarPedidoService` en el cierre de embarque, `import/commit.ts`): para
 * esos, no hay proyección que revertir y el neto ya es 0.
 *
 * No-op (retorna 0) si no hay nada proyectado pendiente.
 *
 * @returns el monto revertido (0 si no hubo).
 */
export async function registrarReversionPedido(
  tx: Prisma.TransactionClient,
  input: { pedidoId: string; clienteId: string; saldoResultante: number },
): Promise<number> {
  const entries = await tx.receivableEntry.findMany({
    where: { pedidoId: input.pedidoId },
    select: { tipo: true, monto: true },
  })
  const neto = entries.reduce(
    (sum, e) => sum + (e.tipo === 'REVERSION' ? -Number(e.monto) : Number(e.monto)),
    0,
  )
  if (neto <= 0) return 0

  await registrarReceivableEntry(tx, {
    pedidoId: input.pedidoId,
    clienteId: input.clienteId,
    tipo: 'REVERSION',
    monto: neto,
    saldoResultante: input.saldoResultante,
    totalPagadoResultante: 0,
    offlineId: null,
  })
  return neto
}

export interface DivergenciaResult {
  divergencia: boolean
  diferencia: number
}

/**
 * Compara la proyección contra el canónico. La divergencia se reporta, NUNCA
 * se autocorrige (contrato §12).
 */
export function detectarDivergencia(
  canonicoSaldo: number,
  proyeccionSaldo: number,
  umbralAbsoluto = 0.01,
): DivergenciaResult {
  const diferencia = Math.abs(canonicoSaldo - proyeccionSaldo)
  return {
    divergencia: diferencia > umbralAbsoluto,
    diferencia,
  }
}

export function registrarDivergencia(detalle: {
  pedidoId?: string | null
  canonico: number
  proyeccion: number
  diferencia: number
}): void {
  incrementMetric('dual_write_divergence_count')
  logger.error(
    { dual_write_divergence: detalle },
    'DUAL_WRITE_DIVERGENCE',
  )
}
