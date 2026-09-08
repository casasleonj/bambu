import type { Pedido } from '../pedidos-client/types'

export type FocoKey = 'porPlanificar' | 'enRuta' | 'esperandoPago' | 'pendientesN2' | 'excepciones'

export interface FocoCount {
  key: FocoKey
  label: string
  value: number
  /** monto en $ si el foco lo muestra (esperandoPago). */
  amount?: number
  /** disciplina de color: color solo si hay algo que hacer hoy. */
  tone: 'none' | 'amber' | 'red'
}

export type AccionKey =
  | 'planificar'
  | 'registrar-entrega'
  | 'completar-pendiente'
  | 'nueva-demanda'
  | 'venta-libre'
  | 'registrar-pago'
  | 'confirmar-pago'
  | 'resolver-excepcion'
  | 'ver-cartera'

export interface AccionDestacada {
  key: AccionKey
  label: string
}

export interface OperacionDerivada {
  /** microcopy, p.ej. "Entregado · debe $12.000 · 3 días" */
  estadoLegible: string
  accionDestacada: AccionDestacada | null
  /** a qué focos pertenece esta operación (multi-pertenencia). */
  focos: FocoKey[]
}

export interface DeriveContext {
  /** true si el pedido tiene una ObligacionPendiente activa. */
  tienePendienteN2?: boolean
  /** true si el pedido tiene disputa/discrepancia/alerta ALTA abierta. */
  tieneExcepcion?: boolean
  /** true si el cliente está bloqueado / promesa vencida. */
  clienteBloqueado?: boolean
  /** hoy en Bogotá (YYYY-MM-DD) para calcular "hace N días". */
  hoyBogota: string
}

export type { Pedido }
