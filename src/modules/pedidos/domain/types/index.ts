/**
 * Pedidos Domain Types.
 *
 * Primitive types and interfaces shared across the pedidos bounded context.
 * Independent of Prisma and any ORM.
 */

import type { ProductCode } from '@/shared/domain'

export type PedidoId = string
export type ClienteId = string
export type NegocioId = string
export type EmbarqueId = string
export type FacturaId = string
export type PagoId = string
export type UserId = string

export const ESTADOS_ENTREGA = [
  'PENDIENTE',
  'EN_RUTA',
  'ENTREGADO',
  'NO_ENTREGADO',
  'CANCELADO',
  'ANULADO',
] as const

export type EstadoEntrega = typeof ESTADOS_ENTREGA[number]

export const ESTADOS_PAGO = [
  'PENDIENTE',
  'PARCIAL',
  'PAGADO',
  'ANTICIPADO',
  'VENCIDO',
  'ANULADO',
] as const

export type EstadoPago = typeof ESTADOS_PAGO[number]

export const CANALES = ['PUNTO', 'DOMICILIO'] as const
export type Canal = typeof CANALES[number]

export const ORIGENES_PEDIDO = [
  'PEDIDO',
  'VENTA_RAPIDA',
  'VENTA_LIBRE',
  'RECURRENTE',
] as const

export type OrigenPedido = typeof ORIGENES_PEDIDO[number]

export const METODOS_PAGO = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'NEQUI',
  'DAVIPLATA',
  'BONO',
] as const

export type MetodoPago = typeof METODOS_PAGO[number]

export interface PagoData {
  metodo: MetodoPago
  monto: number
}

export interface ItemPedidoInput {
  producto: ProductCode
  cantidad: number
  precioManual?: number
}

export interface ItemPedidoResuelto {
  producto: ProductCode
  cantidad: number
  precio: number
  subtotal: number
  origen: 'manual' | 'cliente' | 'volumen' | 'base'
}

export interface PrecioTier {
  cantMin: number
  cantMax: number | null
  precio: number
}

export interface FacturaSnapshot {
  id?: string
  numero: string
  subtotal: number
  total: number
  saldo: number
  estado: 'EMITIDA' | 'PAGADA' | 'ANULADA' | 'PARCIAL'
  montoPagado: number
}

export interface NotaCreditoData {
  numero: string
  monto: number
  motivo: string
  creadoPor?: UserId
}

export interface PedidoHijoData {
  numero: number
  clienteId: ClienteId
  canal: Canal
  origen: OrigenPedido
  total: number
  items: Array<{
    producto: ProductCode
    cantidad: number
    precio: number
  }>
}

export type TipoEntrega = 'COMPLETO' | 'PARCIAL' | 'NO_ENTREGADO'
