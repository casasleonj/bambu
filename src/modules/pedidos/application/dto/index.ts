/**
 * Application Layer DTOs for Pedidos.
 */

import type { ProductCode } from '@/shared/domain'
import type { Canal, OrigenPedido, PagoData } from '../../domain/types'

export interface CrearPedidoInput {
  clienteId: string
  negocioId?: string
  canal: Canal
  origen?: OrigenPedido
  items: Array<{ producto: ProductCode; cantidad: number; precioManual?: number }>
  pagos?: PagoData[]
  obs?: string
  fechaEntrega?: Date
  ventaRapida?: boolean
  /**
   * ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: solo aplica a venta rápida.
   * `undefined` / `true` → entrega inmediata (ENTREGADO, comportamiento histórico).
   * `false` → "entregar después": el pedido queda PENDIENTE (entra al planificador)
   * y `estadoPago` se proyecta a ANTICIPADO si vino prepago total. El route sólo
   * lo propaga con el flag `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` activo.
   */
  entregado?: boolean
  clienteNuevo?: {
    nombre: string
    apellido?: string
    telefono: string
    direccion?: string
    barrio?: string
    fuente?: string
  }
  actualizarCliente?: {
    direccion?: string
    barrio?: string
  }
  /**
   * Snapshot de dirección puntual del pedido (no toca Cliente/Negocio).
   * Se persiste en Pedido.direccionEntrega/barrioEntrega solo si difiere
   * de la dirección resuelta en vivo (negocio gana, fallback cliente) —
   * ver CrearPedidoUseCase.
   */
  direccionEntrega?: string
  barrioEntrega?: string
  createdById?: string
  createdByRole?: string
  // Offline-first: id generado por el cliente para dedup al reenviar
  offlineId?: string
}

export interface ActualizarPedidoInput {
  pedidoId: string
  items?: Array<{ producto: ProductCode; cantidad: number; precioManual?: number }>
  estadoEntrega?: string
  obs?: string
  actualizarCliente?: {
    direccion?: string
    barrio?: string
  }
  /** Snapshot de dirección puntual del pedido — ver CrearPedidoInput. */
  direccionEntrega?: string
  barrioEntrega?: string
  /** Quién dispara la actualización — usado para auditar cambios de dirección. */
  usuarioId?: string
  offlineId?: string
  /** Metadata forense: vincula la actualización a un Caso de antifraude. */
  casoId?: string
}

export interface EntregarPedidoInput {
  pedidoId: string
  itemsEntregados: Array<{ producto: ProductCode; cantidad: number }>
  pagos?: PagoData[]
  // ADR-PAGO-EMBARQUE-CAPTURA-001: embarque de captura del cobro. Obligatorio
  // si `pagos` trae montos; nunca se deriva de `Pedido.embarqueId`.
  embarqueId?: string
  fotoEntrega?: string
  gpsLat?: number
  gpsLng?: number
  gpsAccuracy?: number
  gpsJustificacion?: string
  entregadoConGps?: boolean
  entregadoAt?: string
  codigoVisita?: string
  offlineId?: string
}

export interface AnularPedidoInput {
  pedidoId: string
  motivo?: string
  offlineId?: string
}

export interface CancelarPedidoInput {
  pedidoId: string
  motivo?: string
  offlineId?: string
}

export interface ListarPedidosInput {
  /** Restringe a un conjunto explícito de IDs (ej. vista "en riesgo"). */
  id?: string[]
  clienteId?: string
  desde?: Date
  hasta?: Date
  estadoEntrega?: string[]
  estadoPago?: string[]
  origen?: string[]
  /** `null` filtra explícitamente "sin embarque asignado". */
  embarqueId?: string | null
  /** Canal canónico (`PUNTO` | `DOMICILIO`). G6. */
  canal?: string[]
  /** @deprecated legacy — usar `canal`. */
  tipo?: string[]
  /** Server-side tab scope: isolates Pedidos/Fiados/Alertas datasets. */
  scope?: 'fiados' | 'alertas'
  page?: number
  pageSize?: number
  all?: boolean
}

export interface FacturaDTOSnapshot {
  id: string
  numero: string
  estado: string
  total: number
  saldo: number
  abonos: Array<{
    id: string
    numero: string
    monto: number
    metodoPago: string
    fecha: string
  }>
}

export interface PedidoResumenDTO {
  id: string
  numero: number
  clienteId: string
  negocioId?: string
  embarqueId?: string | null
  canal: string
  tipo: string
  origen: string
  estado: string
  estadoEntrega: string
  estadoPago: string
  total: number
  totalPagado: number
  saldo: number
  fecha: string
  fechaEntrega?: string
  obs?: string
  direccionEntrega?: string | null
  barrioEntrega?: string | null
  offlineId?: string | null
  gpsAccuracy?: number | null
  gpsJustificacion?: string | null
  entregadoConGps: boolean
  entregadoAt?: string | null
  adminOverrideNota?: string | null
  adminOverrideBy?: string | null
  adminOverrideAt?: string | null
  // Legacy price fields (for backward compat with UI and tests)
  precioPacaAgua: number
  precioPacaHielo: number
  precioBotellonFab: number
  precioBotellonDom: number
  precioBolsaAgua: number
  precioBolsaHielo: number
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
  items: Array<{
    producto: string
    cantPedido: number
    cantEntrega: number
    precio: number
    subtotal: number
    precioOrigen: string
  }>
  pagos: Array<{
    metodo: string
    monto: number
  }>
  /**
   * ADR-PAGO-REPORTADO-CONFIRMADO-001 §5 — señales ORTOGONALES a `estadoPago`:
   * un pedido puede estar `PAGADO` (saldo 0) y aún así tener alguna de estas.
   */
  pagoReportadoPendiente: boolean
  pagoDiscrepante: boolean
  factura?: FacturaDTOSnapshot | null
}

export interface CrearPedidoResult {
  pedido: PedidoResumenDTO
  clienteId: string
  // FIX F-N10: indica si la creación fue dedup'd (pedido ya existía por offlineId)
  deduped?: boolean
}

export interface EntregarPedidoResult {
  pedido: PedidoResumenDTO
  hijo?: PedidoResumenDTO
  // FIX F-N7: indica si la entrega fue dedup'd (pedido ya estaba ENTREGADO)
  deduped?: boolean
}
