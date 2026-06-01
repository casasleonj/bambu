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
 * Normalize payments so they do not exceed the total.
 * If overpaid, truncates to the total, preserving the order of payment methods.
 */
export function normalizarPagos(
  pagos: PagoData[],
  total: number,
): PagoData[] {
  const totalPagado = pagos.reduce((sum, p) => sum + p.monto, 0)

  if (totalPagado <= total) {
    return pagos.filter(p => p.monto > 0)
  }

  let remaining = total
  return pagos
    .filter(p => p.monto > 0)
    .map(p => {
      if (remaining <= 0) return null
      const monto = Math.min(p.monto, remaining)
      remaining -= monto
      return { metodo: p.metodo, monto }
    })
    .filter((p): p is PagoData => p !== null)
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
