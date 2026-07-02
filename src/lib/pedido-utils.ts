import { EstadoEntrega, EstadoPago, OrigenPedido } from '@prisma/client'
import { LIMITE_FIADOS_DEFAULT } from './constants'

// ====================
// TRANSICIONES VÁLIDAS
// ====================

export const TRANSICIONES_ENTREGA: Record<EstadoEntrega, EstadoEntrega[]> = {
  PENDIENTE: ['EN_RUTA', 'CANCELADO'],
  EN_RUTA: ['ENTREGADO', 'NO_ENTREGADO', 'PENDIENTE', 'CANCELADO'],
  ENTREGADO: ['ANULADO'],
  NO_ENTREGADO: ['PENDIENTE', 'EN_RUTA', 'CANCELADO'],
  CANCELADO: [],
  ANULADO: [],
}

export const TRANSICIONES_PAGO: Record<EstadoPago, EstadoPago[]> = {
  PENDIENTE: ['PARCIAL', 'PAGADO', 'ANTICIPADO', 'ANULADO'],
  PARCIAL: ['PAGADO', 'ANTICIPADO', 'ANULADO'],
  PAGADO: ['ANULADO'],
  ANTICIPADO: ['PAGADO', 'ANULADO'],
  VENCIDO: ['PAGADO', 'PARCIAL', 'ANULADO'],
  ANULADO: [],
}

export function puedeTransicionarEntrega(
  actual: EstadoEntrega,
  nuevo: EstadoEntrega
): boolean {
  return TRANSICIONES_ENTREGA[actual]?.includes(nuevo) ?? false
}

export function puedeTransicionarPago(
  actual: EstadoPago,
  nuevo: EstadoPago
): boolean {
  return TRANSICIONES_PAGO[actual]?.includes(nuevo) ?? false
}

// ====================
// CÁLCULOS
// ====================

export function calcularEstadoPago(
  total: number,
  totalPagado: number
): EstadoPago {
  if (totalPagado >= total) return 'PAGADO'
  if (totalPagado > 0) return 'PARCIAL'
  return 'PENDIENTE'
}

export function calcularSaldo(total: number, totalPagado: number): number {
  return Math.max(0, total - totalPagado)
}

// ====================
// BADGES VISUALES
// ====================

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

export function getBadgeLegacy(estado: string): BadgeInfo {
  // Para compatibilidad con estado antiguo
  const map: Record<string, BadgeInfo> = {
    PENDIENTE: getBadgeEntrega('PENDIENTE'),
    EN_RUTA: getBadgeEntrega('EN_RUTA'),
    ENTREGADO: getBadgeEntrega('ENTREGADO'),
    NO_ENTREGADO: getBadgeEntrega('NO_ENTREGADO'),
    CANCELADO: getBadgeEntrega('CANCELADO'),
    ANULADO: getBadgeEntrega('ANULADO'),
  }
  return map[estado] || { label: estado, className: 'bg-gray-100 text-gray-600' }
}

// ====================
// VALIDACIONES DE NEGOCIO
// ====================

/**
 * Verifica si un cliente puede crear nuevos pedidos
 * Retorna null si puede, o string con el mensaje de error
 */
export function puedeCrearPedido(
  cliente: {
    bloqueado: boolean
    id: string
  },
  pedidosPendientes: Array<{ id: string; numero: number; saldo: number }>,
  limite: number = LIMITE_FIADOS_DEFAULT
): string | null {
  // Ventas anónimas (CONSUMIDOR_FINAL) nunca se bloquean por deudas previas
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
 * FIX MEDIUM (C-VAL-7): Resuelve el límite de fiados con fallback consistente.
 * La implementación vive en el dominio de pedidos para poder usarla desde
 * CrearPedidoUseCase sin romper la arquitectura DDD. Se re-exporta aquí
 * para mantener compatibilidad con consumidores legacy.
 */
export { resolverLimiteFiados } from '@/modules/pedidos/domain/services/pedido-validation.service'

/**
 * Retorna el estado de fiados de un cliente para mostrar en UI
 */
export function getEstadoFiados(
  pedidosPendientes: Array<{ id: string; numero: number; saldo: number }>,
  limite: number = LIMITE_FIADOS_DEFAULT
): { count: number; limite: number; porcentaje: number; nivel: 'ok' | 'cerca' | 'limite' } {
  const count = pedidosPendientes.length
  const porcentaje = limite > 0 ? (count / limite) * 100 : 100
  let nivel: 'ok' | 'cerca' | 'limite' = 'ok'
  if (count >= limite) nivel = 'limite'
  else if (porcentaje >= 60) nivel = 'cerca'
  return { count, limite, porcentaje, nivel }
}

/**
 * Alerta por múltiples pedidos del mismo día
 */
export function getAlertaPedidoDia(
  countPedidosHoy: number
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
 * Determina si un repartidor puede fiar a un cliente
 */
export function puedeFiar(
  cliente: {
    verificado: boolean
    creadoPorRol: string
    id: string
  },
  esAnonimo: boolean
): boolean {
  if (esAnonimo) return false
  if (cliente.verificado) return true
  // Cliente creado por admin/asistente pero no verificado = puede fiar con precaución
  if (cliente.creadoPorRol === 'ADMIN' || cliente.creadoPorRol === 'ASISTENTE') return true
  // Cliente creado por repartidor y no verificado = NO fiar
  return false
}

// ====================
// MAPEO LEGACY → NUEVO
// ====================

/**
 * Convierte estado antiguo a nuevo estadoEntrega + estadoPago
 */
export function legacyToNewState(
  estado: string,
  saldo: number,
  totalPagado: number
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