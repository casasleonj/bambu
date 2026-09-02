/**
 * Visual states for the Pedidos list cells.
 *
 * This module lives in the presentation layer because it maps domain state
 * (estadoPago, estadoEntrega, saldo) into UI concerns (label, color, icon).
 * Domain layer must NOT depend on this file.
 */

export type EstadoPagoVisualKey = 'PAGADO' | 'FIADO' | 'PENDIENTE' | 'ANULADO' | 'REPORTADO' | 'DISCREPANTE'

export interface EstadoPagoVisual {
  key: EstadoPagoVisualKey
  label: string
  color: 'green' | 'red' | 'gray' | 'amber'
  /** Whether the cell should render the outstanding amount as money. */
  isMoney: boolean
}

export interface PedidoSaldoInput {
  estadoPago: string
  estadoEntrega: string
  saldo: number
  total: number
  totalPagado: number
  /**
   * ADR-PAGO-REPORTADO-CONFIRMADO-001 §5: algún `Pago` del pedido está
   * `REPORTADO` (dinero digital sin verificar). Lo pasa el caller SOLO cuando el
   * flag `NEXT_PUBLIC_PAGO_CONFIRMACION` está activo — así con el flag OFF el
   * badge no cambia. Ortogonal al saldo: SOLO cambia el estado "pagado completo"
   * a "Reportado" — un pedido FIADO (con deuda) sigue mostrando la deuda.
   */
  pagoReportado?: boolean
  /** Algún `Pago` quedó `DISCREPANTE` (verificado, no cuadra). Más urgente. */
  pagoDiscrepante?: boolean
}

/**
 * Determines the visual payment state for a Pedido row.
 *
 * Rules (G5.1: el badge se DERIVA de `(total, totalPagado, estadoEntrega)`,
 * no solo de la columna `estadoPago`):
 *  - ANULADO → estadoEntrega ANULADO/CANCELADO OR estadoPago ANULADO
 *  - FIADO   → estadoEntrega ENTREGADO AND saldo > 0 (la deuda gana; el chip de
 *    "sin confirmar" lo pone el caller aparte si además hay un pago reportado)
 *  - DISCREPANTE → pagado completo Y `pagoDiscrepante` (más urgente que reportado)
 *  - REPORTADO → pagado completo Y `pagoReportado` (AC-05)
 *  - ANTICIPADO → pagado completo Y la entrega aún no ocurrió
 *  - PAGADO  → pagado completo Y ya entregado
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

  // FIADO va ANTES: si el pedido entregado tiene deuda, la deuda es la señal
  // principal — la confirmación del pago parcial la muestra el chip del caller.
  if (pedido.estadoEntrega === 'ENTREGADO' && saldo > 0) {
    return {
      key: 'FIADO',
      label: 'Fiado',
      color: 'red',
      isMoney: true,
    }
  }

  const pagadoCompleto = totalPagado >= total || pedido.estadoPago === 'PAGADO' || pedido.estadoPago === 'ANTICIPADO'

  // AC-05: sobre un pedido pagado completo, la confirmación gana sobre "Pagado".
  if (pagadoCompleto && pedido.pagoDiscrepante) {
    return { key: 'DISCREPANTE', label: 'Discrepancia', color: 'red', isMoney: false }
  }
  if (pagadoCompleto && pedido.pagoReportado) {
    return { key: 'REPORTADO', label: 'Reportado', color: 'amber', isMoney: false }
  }

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

  return {
    key: 'PENDIENTE',
    label: 'Pendiente',
    color: 'gray',
    isMoney: false,
  }
}
