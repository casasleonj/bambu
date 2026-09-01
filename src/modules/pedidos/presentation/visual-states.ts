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
 * Rules (G5.1: el badge se DERIVA de `(total, totalPagado, estadoEntrega)`,
 * no solo de la columna `estadoPago` — así un pedido prepago-pendiente viejo
 * con la columna aún en `PAGADO` igual muestra "Anticipado"):
 *  - ANULADO → estadoEntrega ANULADO/CANCELADO OR estadoPago ANULADO
 *  - ANTICIPADO → pagado completo Y la entrega aún no ocurrió (PENDIENTE/EN_RUTA/NO_ENTREGADO)
 *  - PAGADO  → pagado completo Y ya entregado
 *  - FIADO   → estadoEntrega ENTREGADO AND saldo > 0
 *  - PENDIENTE → resto
 */
export function calcularEstadoPagoVisual(pedido: PedidoSaldoInput): EstadoPagoVisual {
  const saldo = Number(pedido.saldo || 0)
  const total = Number(pedido.total || 0)
  const totalPagado = Number(pedido.totalPagado || 0)

  if (
    pedido.estadoEntrega === 'ANULADO' ||
    pedido.estadoEntrega === 'CANCELADO' ||
    pedido.estadoPago === 'ANULADO'
  ) {
    return {
      key: 'ANULADO',
      label: 'Anulado',
      color: 'gray',
      isMoney: false,
    }
  }

  const pagadoCompleto = totalPagado >= total || pedido.estadoPago === 'PAGADO' || pedido.estadoPago === 'ANTICIPADO'

  if (pagadoCompleto) {
    const preEntrega =
      pedido.estadoEntrega === 'PENDIENTE' ||
      pedido.estadoEntrega === 'EN_RUTA' ||
      pedido.estadoEntrega === 'NO_ENTREGADO'
    return {
      key: 'PAGADO',
      label: preEntrega ? 'Anticipado' : 'Pagado',
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
