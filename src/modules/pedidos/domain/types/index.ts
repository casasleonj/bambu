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
  /**
   * ADR-PAGO-REPORTADO-CONFIRMADO-001: estado de confirmación del pago. Solo lo
   * hidrata `PedidoMapper.fromPrisma` (lectura); los comandos que crean pagos no
   * lo setean acá (lo decide `datosConfirmacionInicial` en la infra).
   */
  confirmacion?: string
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
  // Snapshot de datos de empresa al momento de emisión (inmutable)
  empresaNombre?: string
  empresaNit?: string
  empresaDireccion?: string
  empresaTelefono?: string
  empresaEmail?: string
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
  // FIX BAMBU-LOG-004: el pedido hijo (faltante de una entrega parcial)
  // debe heredar negocioId y el snapshot de dirección del padre — si no,
  // su dirección/coords se resuelven contra el Cliente en vez del
  // Negocio/sucursal original.
  negocioId?: string
  direccionEntrega?: string
  barrioEntrega?: string
}

export type TipoEntrega = 'COMPLETO' | 'PARCIAL' | 'NO_ENTREGADO'

export type FiadoStatusNivel = 'ok' | 'cerca' | 'limite'

/**
 * F1 (Autoridad de Crédito, docs/AGUA_BAMBU_F1_DISENO_TECNICO_AUTORIDAD_CREDITO_v1.0.md):
 * distingue AT_LIMIT (count === limite) de OVER_LIMIT (count > limite) —
 * antes ambos colapsaban en `nivel: 'limite'`. Es una derivación más
 * granular del mismo dato (count/limite), NO cambia el criterio de
 * bloqueo (que sigue siendo `count >= limite`, sin modificar).
 */
export type FiadoStatusResultado = 'OK' | 'AT_LIMIT' | 'OVER_LIMIT' | 'NOT_APPLICABLE'

export interface FiadoStatus {
  count: number
  limite: number
  nivel: FiadoStatusNivel
  pedidos: Array<{ id: string; numero: number; saldo: number }>
  /** F1: exposición monetaria actual — suma de `pedidos[].saldo`. Informativo, no bloquea. */
  outstandingAmount: number
  /** F1: solo presentes si se evaluó una operación concreta (`operacion` en el input). */
  operationOutstanding?: number
  projectedOpenCount?: number
  projectedOutstandingAmount?: number
  status: FiadoStatusResultado
  /**
   * F1: decisión consolidada (antes vivía duplicada en Commit/venta-libre
   * vía `puedeCrearPedido` inline). `null` si el cliente puede continuar;
   * mensaje de error si no. Solo se evalúa cuando `operacion` deja saldo
   * pendiente (mismo guard `totalPagado < total` ya vigente).
   */
  errorDeuda: string | null
  /**
   * F2 (Excepciones de Crédito): presente SOLO si se pasó `excepcionId` en
   * el input Y la excepción es válida para este cliente (AUTORIZADA, no
   * consumida todavía — `pedidoId` aún null). Cuando está presente,
   * `errorDeuda` ya viene en `null` — los consumidores no vuelven a
   * interpretar la excepción por su cuenta, solo leen este resultado.
   * Esto es de SOLO LECTURA: no marca la excepción como consumida — eso
   * lo hace el propio commit, atómicamente, en la misma transacción en la
   * que crea el Pedido (ver SolicitarExcepcionCreditoUseCase / diseño F2).
   */
  excepcionAplicada?: { id: string; motivoSolicitud: string; autorizadoPorId: string }
}
