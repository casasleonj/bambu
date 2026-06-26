/**
 * Pedido Validation Domain Service.
 *
 * Pure business rules for order creation limits, credit checks, and alerts.
 * No database access.
 */

export interface ClienteResumen {
  id: string
  bloqueado: boolean
  verificado: boolean
  creadoPorRol: string
}

export interface PedidoResumen {
  id: string
  numero: number
  saldo: number
}

/**
 * Checks if a customer can place a new order.
 * Returns null if allowed, or an error message string.
 */
export function puedeCrearPedido(
  cliente: ClienteResumen,
  pedidosPendientes: PedidoResumen[],
  limite: number = 3,
): string | null {
  if (cliente.id === 'CONSUMIDOR_FINAL') return null

  if (cliente.bloqueado) {
    return 'Cliente bloqueado por deuda vencida. Pague primero.'
  }

  if (pedidosPendientes.length >= limite) {
    return `Cliente tiene ${pedidosPendientes.length} pedidos fiados (límite: ${limite}). Pague primero para crear más.`
  }

  return null
}

/**
 * Resolves the effective fiado limit for a customer.
 * Priority: cliente.limitePedidosFiados > config global > default (3)
 */
export function resolverLimiteFiados(
  cliente: { limitePedidosFiados?: number | null },
  configValor: string | null,
  defaultValue = 3,
): number {
  if (cliente.limitePedidosFiados != null && cliente.limitePedidosFiados > 0) {
    return cliente.limitePedidosFiados
  }
  if (configValor != null) {
    const parsed = parseInt(configValor, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return defaultValue
}

/**
 * Returns the customer's credit status for UI display.
 */
export function getEstadoFiados(
  pedidosPendientes: PedidoResumen[],
  limite: number = 3,
): { count: number; limite: number; porcentaje: number; nivel: 'ok' | 'cerca' | 'limite' } {
  const count = pedidosPendientes.length
  const porcentaje = limite > 0 ? (count / limite) * 100 : 100
  let nivel: 'ok' | 'cerca' | 'limite' = 'ok'
  if (count >= limite) nivel = 'limite'
  else if (porcentaje >= 60) nivel = 'cerca'
  return { count, limite, porcentaje, nivel }
}

/**
 * Alert for multiple orders on the same day.
 */
export function getAlertaPedidoDia(
  countPedidosHoy: number,
): { tipo: 'ninguna' | 'amarilla' | 'roja'; mensaje: string } {
  if (countPedidosHoy >= 3) {
    return { tipo: 'roja', mensaje: `${countPedidosHoy} pedidos hoy` }
  }
  if (countPedidosHoy >= 2) {
    return { tipo: 'amarilla', mensaje: '2do pedido hoy' }
  }
  return { tipo: 'ninguna', mensaje: '' }
}

/**
 * Determines if a delivery person can extend credit to a customer.
 */
export function puedeFiar(
  cliente: {
    verificado: boolean
    creadoPorRol: string
    id: string
  },
  esAnonimo: boolean,
): boolean {
  if (esAnonimo) return false
  if (cliente.verificado) return true
  if (cliente.creadoPorRol === 'ADMIN' || cliente.creadoPorRol === 'ASISTENTE') return true
  return false
}
