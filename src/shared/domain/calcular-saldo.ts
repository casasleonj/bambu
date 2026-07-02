import { Money } from './value-objects'

/**
 * Contexto opcional para diagnosticar inconsistencias de data.
 */
export interface CalcularSaldoContext {
  pedidoId?: string
  estadoPago?: string
}

/**
 * Callbacks opcionales para auditar casos anómalos sin acoplar la función
 * a un logger específico. Los callers pueden usar `logger.warn` o cualquier
 * otro mecanismo de observabilidad.
 */
export interface CalcularSaldoCallbacks {
  onOverpayment?: (exceso: Money) => void
  onInconsistencia?: (saldo: Money) => void
}

export interface CalcularSaldoOptions {
  context?: CalcularSaldoContext
  callbacks?: CalcularSaldoCallbacks
}

/**
 * Calcula el saldo pendiente de un pedido, garantizando que nunca sea negativo.
 *
 * Reglas:
 *  - total >= totalPagado → retorna total - totalPagado
 *  - totalPagado > total  → retorna 0 (overpayment se reporta vía callback)
 *  - estadoPago='PAGADO' y saldo > 0 → reporta inconsistencia vía callback
 *
 * Uso en dominio: `Pedido.saldo`, pagos, formulario y API.
 */
export function calcularSaldo(
  total: Money,
  totalPagado: Money,
  options?: CalcularSaldoOptions,
): Money {
  const saldo = total.subtract(totalPagado)

  if (saldo.cents < 0) {
    const exceso = new Money(-saldo.cents)
    options?.callbacks?.onOverpayment?.(exceso)
    return new Money(0)
  }

  if (options?.context?.estadoPago === 'PAGADO' && saldo.cents > 0) {
    options.callbacks?.onInconsistencia?.(saldo)
  }

  return saldo
}
