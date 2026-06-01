/**
 * Pedido Transitions Domain Service.
 *
 * Pure business logic for state transitions and visual badges.
 * No side effects, no database access.
 */

import type { EstadoEntrega, EstadoPago, OrigenPedido } from '../types'
import { EstadoEntregaVO } from '../value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../value-objects/EstadoPago'

export interface BadgeInfo {
  label: string
  className: string
}

export function getBadgeEntrega(estado: EstadoEntrega): BadgeInfo {
  const map: Record<EstadoEntrega, BadgeInfo> = {
    PENDIENTE: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800 border border-amber-200' },
    EN_RUTA: { label: 'En Ruta', className: 'bg-blue-100 text-blue-800 border border-blue-200' },
    ENTREGADO: { label: 'Entregado', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
    NO_ENTREGADO: { label: 'No Entregado', className: 'bg-orange-100 text-orange-800 border border-orange-200' },
    CANCELADO: { label: 'Cancelado', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
    ANULADO: { label: 'Anulado', className: 'bg-rose-100 text-rose-700 border border-rose-200' },
  }
  return map[estado]
}

export function getBadgePago(estado: EstadoPago): BadgeInfo {
  const map: Record<EstadoPago, BadgeInfo> = {
    PENDIENTE: { label: 'Por Cobrar', className: 'bg-red-100 text-red-800 border border-red-200' },
    PARCIAL: { label: 'Parcial', className: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
    PAGADO: { label: 'Pagado', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
    ANTICIPADO: { label: 'Anticipado', className: 'bg-indigo-100 text-indigo-800 border border-indigo-200' },
    VENCIDO: { label: 'Vencido', className: 'bg-rose-100 text-rose-800 border border-rose-200' },
    ANULADO: { label: 'Anulado', className: 'bg-gray-100 text-gray-500 border border-gray-300' },
  }
  return map[estado]
}

export function getBadgeOrigen(origen: OrigenPedido): BadgeInfo {
  const map: Record<OrigenPedido, BadgeInfo> = {
    PEDIDO: { label: 'Pedido', className: 'border border-blue-300 text-blue-700 bg-transparent' },
    VENTA_RAPIDA: { label: 'Venta Rápida', className: 'border border-emerald-300 text-emerald-700 bg-transparent' },
    VENTA_LIBRE: { label: 'Venta Libre', className: 'border border-purple-300 text-purple-700 bg-transparent' },
    RECURRENTE: { label: 'Recurrente', className: 'border border-orange-300 text-orange-700 bg-transparent' },
  }
  return map[origen]
}

/**
 * Validates if a delivery state transition is allowed.
 * Delegates to the value object but keeps the service as the canonical entry point.
 */
export function puedeTransicionarEntrega(actual: EstadoEntrega, nuevo: EstadoEntrega): boolean {
  return EstadoEntregaVO.from(actual).canTransitionTo(EstadoEntregaVO.from(nuevo))
}

/**
 * Validates if a payment state transition is allowed.
 */
export function puedeTransicionarPago(actual: EstadoPago, nuevo: EstadoPago): boolean {
  return EstadoPagoVO.from(actual).canTransitionTo(EstadoPagoVO.from(nuevo))
}

/**
 * Convert legacy combined estado to new split state.
 */
export function legacyToNewState(
  estado: string,
  saldo: number,
  totalPagado: number,
): { estadoEntrega: EstadoEntrega; estadoPago: EstadoPago } {
  const estadoEntrega = (estado as EstadoEntrega) || 'PENDIENTE'
  let estadoPago: EstadoPago = 'PENDIENTE'

  if (estadoEntrega === 'ENTREGADO') {
    if (saldo <= 0) estadoPago = 'PAGADO'
    else if (totalPagado > 0) estadoPago = 'PARCIAL'
    else estadoPago = 'PENDIENTE'
  } else if (estadoEntrega === 'CANCELADO' || estadoEntrega === 'ANULADO') {
    estadoPago = 'ANULADO'
  }

  return { estadoEntrega, estadoPago }
}
