/**
 * Pagos Calculator Domain Service.
 *
 * Pure business logic for payment calculations and normalization.
 */

import type { EstadoPago, PagoData } from '../types'
import { EstadoPagoVO } from '../value-objects/EstadoPago'

/**
 * Calculate payment state from total and amount paid.
 */
export function calcularEstadoPago(total: number, totalPagado: number): EstadoPago {
  return EstadoPagoVO.fromTotals(total, totalPagado).get()
}

/**
 * Calculate remaining balance.
 */
export function calcularSaldo(total: number, totalPagado: number): number {
  return Math.max(0, total - totalPagado)
}

/**
 * FIX Fase 2 §3.4: resultado de normalizar pagos. Distingue pagos
 * aplicados al pedido del excedente (que va a saldo a favor del cliente).
 * Antes el excedente se truncaba en silencio — eso descartaba plata sin
 * registro. Ahora la route puede persistir el excedente como saldoFavor.
 */
export interface NormalizarPagosResult {
  pagosAplicados: PagoData[]
  excedente: number // monto que NO se aplicó al pedido (>= 0)
}

/**
 * Normalize payments so they do not exceed the total.
 * If overpaid, truncates the LAST payment(s) to fit, returning the
 * excedente explicitly so the caller can persist it as cliente.saldoFavor.
 */
export function normalizarPagos(
  pagos: PagoData[],
  total: number,
): NormalizarPagosResult {
  const pagosPositivos = pagos.filter(p => p.monto > 0)
  const totalPagado = pagosPositivos.reduce((sum, p) => sum + p.monto, 0)

  if (totalPagado <= total) {
    return { pagosAplicados: pagosPositivos, excedente: 0 }
  }

  let remaining = total
  const aplicados: PagoData[] = []
  for (const p of pagosPositivos) {
    if (remaining <= 0) {
      // Toda esta entrada y las siguientes son excedente.
      break
    }
    const monto = Math.min(p.monto, remaining)
    remaining -= monto
    aplicados.push({ metodo: p.metodo, monto })
  }
  const excedente = Math.max(0, totalPagado - total)
  return { pagosAplicados: aplicados, excedente }
}

/**
 * Compute how much of each payment method was used.
 * Returns a map of method -> total amount.
 */
export function agruparPagosPorMetodo(pagos: PagoData[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const p of pagos) {
    result[p.metodo] = (result[p.metodo] || 0) + p.monto
  }
  return result
}

/**
 * Calculate the financial state of a pedido after delivery and payments.
 */
export function calcularEstadoDespuesEntrega(
  totalEntregado: number,
  totalPagadoAcumulado: number,
): { saldo: number; estadoPago: EstadoPago } {
  const saldo = calcularSaldo(totalEntregado, totalPagadoAcumulado)
  const estadoPago = calcularEstadoPago(totalEntregado, totalPagadoAcumulado)
  return { saldo, estadoPago }
}
