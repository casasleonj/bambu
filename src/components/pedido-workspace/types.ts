import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'

/** ALS §8 — de dónde salió el valor de un campo. */
export type ValueOrigin = 'USER' | 'HISTORY' | 'RULE' | 'CALCULATION' | 'DEFAULT'

export type ProductoCodigo = 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO'

export interface DraftItem {
  producto: ProductoCodigo
  cantidad: number
  precioManual?: number
}

export interface DraftPago {
  metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'BONO'
  monto: number
}

/** El borrador de la operación — lo que el usuario está componiendo. */
export interface DraftPedido {
  clienteId: string | null
  negocioId: string | null
  canal: 'PUNTO' | 'DOMICILIO'
  origen: 'PEDIDO' | 'VENTA_RAPIDA'
  items: DraftItem[]
  pagos: DraftPago[]
  entregado?: boolean
  obs?: string
  direccionEntrega?: string
  barrioEntrega?: string
  /** G11.B — trazabilidad cuando el flujo es "nueva demanda". */
  pedidoOrigenId?: string
}

/**
 * Máquina de estados de UI (ALS §6). Es la **ruta máxima**; el reducer la
 * recorre de forma adaptativa (una operación normal salta REVIEW_REQUIRED /
 * AUTHORIZATION_REQUIRED).
 */
export type WorkspacePhase =
  | 'EMPTY'
  | 'CONTEXT_READY'
  | 'DRAFTING'
  | 'PREVIEW_READY'
  | 'REVIEW_REQUIRED'
  | 'AUTHORIZATION_REQUIRED'
  | 'COMMITTING'
  | 'COMMITTED'

export type WorkspaceErrorKind =
  | 'VALIDATION_ERROR'
  | 'CONFLICT_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTHORIZATION_ERROR'

export interface WorkspaceState {
  phase: WorkspacePhase
  draft: DraftPedido
  /** procedencia por campo/producto (ALS §8). */
  valueOrigins: Record<string, ValueOrigin>
  /** resultado del último preview del backend, o null si el draft cambió. */
  preview: PreviewPedidoResult | null
  /** true mientras el preview está en vuelo. */
  previewPending: boolean
  error: { kind: WorkspaceErrorKind; message: string } | null
}

export type WorkspaceAction =
  | { type: 'SET_CLIENTE'; clienteId: string; negocioId?: string | null }
  | { type: 'CLEAR_CLIENTE' }
  | { type: 'SET_NEGOCIO'; negocioId: string | null }
  | { type: 'SET_CANAL'; canal: 'PUNTO' | 'DOMICILIO' }
  | { type: 'SET_ITEM_CANTIDAD'; producto: ProductoCodigo; cantidad: number }
  | { type: 'SET_ITEM_PRECIO_MANUAL'; producto: ProductoCodigo; precioManual: number | undefined }
  | { type: 'SET_PAGOS'; pagos: DraftPago[] }
  | { type: 'SET_ENTREGADO'; entregado: boolean }
  | { type: 'SET_OBS'; obs: string }
  | { type: 'SET_DIRECCION'; direccion: string; barrio: string }
  /** flujo "Repetir" — aplica varios campos de una con su procedencia. */
  | { type: 'APPLY_PROPOSAL'; draft: Partial<DraftPedido>; origins: Record<string, ValueOrigin> }
  | { type: 'PREVIEW_PENDING' }
  | { type: 'PREVIEW_RECEIVED'; preview: PreviewPedidoResult }
  | { type: 'PREVIEW_ERROR'; kind: WorkspaceErrorKind; message: string }
  | { type: 'COMMIT_START' }
  | { type: 'COMMIT_SUCCESS' }
  | { type: 'COMMIT_CONFLICT'; message: string }
  | { type: 'COMMIT_ERROR'; message: string }
  | { type: 'ACKNOWLEDGE_REVIEW' }
  | { type: 'RESET'; draft?: Partial<DraftPedido> }
