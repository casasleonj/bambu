/**
 * Application Layer DTOs for Pedidos.
 */

import type { ProductCode } from '@/shared/domain'
import type { Canal, OrigenPedido, PagoData } from '../../domain/types'
import type { EntregaResuelta } from '../../domain/services/entrega-suficiencia.service'

export type { EntregaResuelta }

export interface CrearPedidoInput {
  clienteId: string
  negocioId?: string
  canal: Canal
  origen?: OrigenPedido
  items: Array<{ producto: ProductCode; cantidad: number; precioManual?: number }>
  pagos?: PagoData[]
  obs?: string
  fechaEntrega?: Date
  /**
   * ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: solo aplica a venta rápida.
   * `undefined` / `true` → entrega inmediata (ENTREGADO, comportamiento histórico).
   * `false` → "entregar después": el pedido queda PENDIENTE (entra al planificador)
   * y `estadoPago` se proyecta a ANTICIPADO si vino prepago total. El route sólo
   * lo propaga con el flag `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` activo.
   */
  entregado?: boolean
  /**
   * G11 (decisión PO 2026-09-06, "B. Nueva demanda"): id del Pedido que
   * originó esta nueva demanda, cuando corresponde. Puramente de
   * trazabilidad — este Pedido nace independiente, con su propio ciclo de
   * vida (no hereda cantidad/pago/estado del original).
   */
  pedidoOrigenId?: string
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
  /** Fase 8 F8-i: faceta "con recurrencia" — solo pedidos cuyo contexto
   *  (cliente o negocio) tiene una `PlantillaRecurrente` activa. */
  conRecurrencia?: boolean
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

// ─── Peek (Fase 4b del Hub) — datos de la capa 2 del peek contextual ─────────
// Se añaden a la respuesta de GET /api/pedidos/[id] (aditivo). Solo lectura.

export interface PedidoPeekExtras {
  pendienteN2: {
    id: string
    producto: string
    remanente: number
    estado: string
    actividades: Array<{
      id: string
      tipo: string
      cantidad: number
      cantidadCumplida: number
      estado: string
      modo: string | null
      embarqueId: string | null
    }>
  } | null
  embarqueResumen: { id: string; numeroDia: number; estado: string; repartidor: string | null } | null
  pedidosVinculados: Array<{ id: string; numero: number; rol: 'demanda' | 'origen'; total: number; estadoEntrega: string }>
  casosAbiertos: Array<{ id: string; alertaTipo: string; severidad: string; status: string }>
  /**
   * Evidencia de la entrega — dato PROPIO del Pedido (§6.2, Fase 7-ii).
   * `null` salvo que `estadoEntrega === 'ENTREGADO'`. Solo lectura.
   */
  entregaResumen: {
    fecha: string | null
    gpsLat: number | null
    gpsLng: number | null
    fotoUrl: string | null
  } | null
  /**
   * "Pedido habitual" del contexto de este pedido (Fase 8 F8-0). Resuelto por
   * la regla Q4: negocio si `pedido.negocioId`, si no cliente. `null` si el
   * contexto no tiene plantilla. Solo lectura — la palabra "plantilla" no se
   * expone en la UI.
   */
  recurrencia: {
    id: string
    cadaNDias: number
    canal: string
    activo: boolean
    proximaFecha: string | null
    productos: Array<{ producto: string; cantidad: number }>
  } | null
}

export interface EntregarPedidoResult {
  pedido: PedidoResumenDTO
  hijo?: PedidoResumenDTO
  // FIX F-N7: indica si la entrega fue dedup'd (pedido ya estaba ENTREGADO)
  deduped?: boolean
}

// ─── Preview (Fase 4, prerequisito del blueprint — BRECHA §9.1) ───────────────
// Read-only. NUNCA persiste ni modifica ninguna entidad.
// Contrato normativo: docs/pedidos/02-api-contract-pedidos.md.

export interface PreviewPedidoInput {
  clienteId: string
  negocioId?: string
  canal?: 'PUNTO' | 'DOMICILIO'
  origen?: 'PEDIDO' | 'VENTA_RAPIDA'
  items: Array<{ producto: ProductCode; cantidad: number; precioManual?: number }>
  pagos?: Array<{ metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'BONO'; monto: number }>
  entregado?: boolean
  /** snapshot de dirección/barrio que el usuario capturó para ESTE pedido (gana sobre negocio/cliente). */
  direccionEntrega?: string | null
  barrioEntrega?: string | null
  pedidoOrigenId?: string
  /** modo edición: preview de un PUT declarativo de items sobre un pedido existente. */
  pedidoId?: string
  /** userId de la sesión — lo inyecta la route, no viene del body. */
  actorId: string
}

export interface PreviewCalculationItem {
  producto: string
  cantidad: number
  /** Precio final de Pricing — ya incluye recargo de domicilio si aplica. */
  precioUnitario: number
  /** precioUnitario × cantidad. */
  subtotal: number
  precioOrigen: 'manual' | 'cliente' | 'volumen' | 'base'
}

export interface PreviewPedidoResult {
  calculation: {
    items: PreviewCalculationItem[]
    /** total − recargoDomicilio. */
    subtotal: number
    recargoDomicilio: number
    /** Σ items[].subtotal. */
    total: number
    /** Σ normalizarPagos(request.pagos, total).pagosAplicados. */
    totalPagado: number
    /** calcularSaldo(total, totalPagado). */
    saldoProyectado: number
    /** normalizarPagos(request.pagos, total).excedente — iría a Cliente.saldoFavor en el commit. Edición: 0. */
    saldoFavorProyectado: number
    /** Creación: PENDIENTE/ENTREGADO. Edición: el estadoEntrega actual del pedido (no cambia). */
    estadoEntregaProyectado: 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO' | 'NO_ENTREGADO'
    estadoPagoProyectado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANTICIPADO' | 'VENCIDO'
  }
  permissions: {
    canCreate: boolean
    canSetManualPrice: boolean
  }
  allowedActions: Array<'crear' | 'crear-y-enviar-a-ruta' | 'actualizar'>
  warnings: Array<{ code: string; message: string; field?: string }>
  riskSignals: Array<{ tipo: string; severidad: 'BAJA' | 'MEDIA' | 'ALTA'; detalle: string }>
  /**
   * Suficiencia de la información de entrega (docs/pedidos/entrega-suficiencia-plan.md).
   * `PreviewPedidoUseCase` SIEMPRE la emite; opcional en el tipo solo para no
   * romper fixtures parciales de test (un `undefined` = no bloquea).
   */
  entrega?: EntregaResuelta
  requiresAuthorization: boolean
  authorizationPolicy?: string
  auditPreview: {
    actor: string
    accion: 'CREAR_PEDIDO' | 'ACTUALIZAR_PEDIDO'
    recurso: 'Pedido (nuevo)' | 'Pedido (edición)'
    valoresRelevantes: {
      total: number
      clienteId: string
      canal: string
      origen: string
      tienePrecioManual: boolean
    }
  }
}
