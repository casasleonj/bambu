/**
 * Visual states for the Pedidos list cells.
 *
 * This module lives in the presentation layer because it maps domain state
 * (estadoPago, estadoEntrega, saldo) into UI concerns (label, color, icon).
 * Domain layer must NOT depend on this file.
 */

export type EstadoPagoVisualKey = 'PAGADO' | 'FIADO' | 'PENDIENTE' | 'ANULADO'

export interface EstadoPagoVisual {
  key: EstadoPagoVisualKey
  label: string
  color: 'green' | 'red' | 'gray'
  /** Whether the cell should render the outstanding amount as money. */
  isMoney: boolean
}

export interface PedidoSaldoInput {
  estadoPago: string
  estadoEntrega: string
  saldo: number
  total: number
  totalPagado: number
}

/**
 * Determines the visual payment state for a Pedido row.
 *
 * Rules:
 *  - ANULADO → estadoEntrega is ANULADO OR estadoPago is ANULADO
 *  - PAGADO  → estadoPago is PAGADO/ANTICIPADO OR totalPagado >= total
 *  - FIADO   → estadoEntrega is ENTREGADO AND saldo > 0
 *  - PENDIENTE → everything else (including partial payments before delivery)
 *
 * This prevents showing a green checkmark for a pedido that is still pending.
 */
export function calcularEstadoPagoVisual(pedido: PedidoSaldoInput): EstadoPagoVisual {
  const saldo = Number(pedido.saldo || 0)
  const total = Number(pedido.total || 0)
  const totalPagado = Number(pedido.totalPagado || 0)

  if (pedido.estadoEntrega === 'ANULADO' || pedido.estadoPago === 'ANULADO') {
    return {
      key: 'ANULADO',
      label: 'Anulado',
      color: 'gray',
      isMoney: false,
    }
  }

  const isPagado =
    pedido.estadoPago === 'PAGADO' ||
    pedido.estadoPago === 'ANTICIPADO' ||
    totalPagado >= total

  if (isPagado) {
    return {
      key: 'PAGADO',
      label: pedido.estadoPago === 'ANTICIPADO' ? 'Anticipado' : 'Pagado',
      color: 'green',
      isMoney: false,
    }
  }

  if (pedido.estadoEntrega === 'ENTREGADO' && saldo > 0) {
    return {
      key: 'FIADO',
      label: 'Fiado',
      color: 'red',
      isMoney: true,
    }
  }

  return {
    key: 'PENDIENTE',
    label: 'Pendiente',
    color: 'gray',
    isMoney: false,
  }
}
