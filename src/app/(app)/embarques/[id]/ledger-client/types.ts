export type TipoMovimiento =
  | 'CARGA'
  | 'RECARGA'
  | 'ENTREGA'
  | 'VENTA_RUTA'
  | 'RETORNO'
  | 'REEMPAQUE'
  | 'DESCARTE'
  | 'CUSTODY_TRANSFER'
  | 'PROMOCION'
  | 'AJUSTE_AUTORIZADO'

export interface Movimiento {
  id: string
  embarqueId: string
  cargaId: string | null
  tipo: TipoMovimiento
  producto: string
  cantidad: number
  origen: string | null
  destino: string | null
  metadata: Record<string, unknown> | null
  authorization: string | null
  userId: string | null
  autorizador: { id: string; nombre: string } | null
  createdAt: string
  offlineId: string | null
}

export type RecoveryTipo = 'SOBRANTE' | 'FALTANTE'

export interface RecoveryDecision {
  id: string
  embarqueId: string
  sourceEventId: string | null
  cantidadDisponibleEnOrigen: number | null
  cantidad: number
  cantidadAplicada: number
  tipo: RecoveryTipo
  producto: string
  pedidoOrigenId: string | null
  pedidoDestinoId: string | null
  resultado: string
  actorId: string
  authorizedById: string | null
  reason: string
  createdAt: string
  offlineId: string | null
  sourceEvent: { id: string; tipo: TipoMovimiento; producto: string; cantidad: number; createdAt: string } | null
  pedidoOrigen: { id: string; numero: number } | null
  pedidoDestino: { id: string; numero: number } | null
}

export interface PedidoOption {
  id: string
  numero: number
}
