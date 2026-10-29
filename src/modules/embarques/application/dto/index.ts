/**
 * Embarques Application DTOs.
 *
 * Data Transfer Objects for use case inputs and outputs.
 */

import type { EstadoEmbarqueValue, ProductCode, CapacidadNivel } from '../../domain'

// --- Input DTOs ---

export interface CrearEmbarqueInput {
  trabajadorId: string
  rutaId?: string
  carga: Record<ProductCode, number>
  tipoMoto?: string
  baseDinero: number
  horaSalida?: Date
  codigoVisita?: string
  obs?: string
  createdById?: string
  verificarStock?: boolean
  maxUnidades?: number
  // Offline-first dedup (ADR-OFFLINE-001): si llega un retry con el mismo
  // offlineId de un embarque ya creado, se devuelve el existente.
  offlineId?: string
  // FASE 8 (ADR-STOCK-001, §10): metadata de validación al crear la carga.
  availabilityBasis?: 'CONFIRMED_STOCK' | 'PRODUCTION_CONFIRMED' | 'ESTIMATED' | 'MIXED'
}

export interface CancelarEmbarqueInput {
  id: string
}

export interface CerrarEmbarqueInput {
  id: string
  pedidos: Array<{
    pedidoId: string
    entregado: 'COMPLETO' | 'PARCIAL' | 'NO_ENTREGADO'
    productosEntregados?: {
      cPacaAguaEnt: number
      cPacaHieloEnt: number
      cBotellonFabEnt: number
      cBotellonDomEnt: number
      cBolsaAguaEnt: number
      cBolsaHieloEnt: number
    }
    pagos: Array<{ metodo: string; monto: number }>
    preciosReales?: Record<string, number>
    nuevoEmbarqueId?: string
    obs?: string
  }>
  ventasLibres?: Array<{
    clienteId: string
    cPacaAgua: number
    cPacaHielo: number
    cBotellonFab: number
    cBotellonDom: number
    cBolsaAgua: number
    cBolsaHielo: number
    pagos: Array<{ metodo: string; monto: number }>
    obs?: string
    /** ADR-CIERRE-002 §4: tienda de la venta y pedido del que nace la compra adicional. */
    negocioId?: string
    pedidoOrigenId?: string
    /** F2: excepción de crédito ya autorizada para esta venta. */
    excepcionId?: string
  }>
  productosRetorno?: Array<{
    producto: string
    devueltas: number
    cambios: number
    rotas: number
  }>
  /**
   * #446: `cambios` sale de las sustituciones registradas del embarque; un `cambios`
   * tecleado distinto de la suma se rechaza (CAMBIOS_NO_COINCIDEN). Sin este flag
   * (cierre V1) `cambios` sigue siendo el número tecleado.
   */
  cambiosDesdeSustituciones?: boolean
  gastos?: Array<{
    categoria: string
    nota?: string
    monto: number
  }>
  dineroEntregado?: number
  justificacionDiscrepancia?: string
  // PR3: permite justificar un faltante de caja para evitar crear
  // una DeudaTrabajador automática al cerrar el embarque.
  justificacionFaltante?: string
  obs?: string
  // BAMBU-LOG-006: offline-first dedup. Si un retry llega con el mismo
  // offlineId de un embarque ya CERRADO, se devuelve el resultado
  // existente en vez de fallar con EMBARQUE_YA_CERRADO.
  offlineId?: string
  // A.3.4: si true, el use case corre el mismo cálculo y los mismos
  // side effects dentro de la transacción, pero nunca hace commit — ver
  // DryRunSignal en CerrarEmbarqueUseCase. Garantiza que el preview de
  // Reconciliation vea exactamente lo que el cierre real decidiría.
  dryRun?: boolean
}

export interface AutoGenerarEmbarquesInput {
  fecha: Date
  maxUnidades?: number
}

export interface GestionarGastoInput {
  embarqueId: string
  categoria: string
  descripcion: string
  monto: number
  responsable?: string
  notas?: string
  createdById?: string
}

// --- Output DTOs ---

export interface EmbarqueResumenDTO {
  id: string
  numero: number
  numeroDia: number
  fecha: string
  trabajadorId: string
  trabajadorNombre: string
  rutaId?: string
  rutaNombre?: string
  estado: EstadoEmbarqueValue
  totalUnidades: number
  pesoKg: number
  capacidadKg: number
  capacidadPorcentaje: number
  capacidadNivel: CapacidadNivel
  capacidadLabel: string
  capacidadColor: string
  capacidadIcon: string
  horaSalida?: string
  horaLlegada?: string
  tipoMoto?: string
  baseDinero: number
  dineroEntregado: number
  codigoVisita?: string
  obs?: string
  pedidosCount: number
  gastosCount: number
  totalGastos: number
  createdAt: string
  updatedAt: string
}

export interface EmbarqueDetalleDTO extends EmbarqueResumenDTO {
  productos: Array<{
    id: string
    producto: ProductCode
    cargadas: number
    devueltas: number
    cambios: number
    rotas: number
    entregadas: number
  }>
  gastos: Array<{
    id: string
    categoria: string
    descripcion: string
    monto: number
    responsable?: string
    notas?: string
  }>
  pedidos?: Array<{
    id: string
    numero: number
    clienteId: string
    clienteNombre: string
    estadoEntrega: string
    estado: string
    total: number
    items: Array<{
      producto: string
      cantidad: number
      cantEntrega: number
      precio: number
    }>
    pagos: Array<{
      metodo: string
      monto: number
    }>
  }>
}

export interface CierreResultadoDTO {
  embarqueId: string
  estado: string
  pedidosProcesados: number
  pedidosHijosCreados: Array<{ id: string; numero: number }>
  pedidosActualizados: Array<{ id: string; estado: string }>
  ventasLibresCreadas: number
  discrepanciaTotal: number
  // FASE 6 (§13): casos de responsabilidad detectados, pendientes de
  // resolución autorizada. Ya NO se crea el cargo económico automáticamente.
  responsibilityCases: Array<{ id: string; tipo: string; montoEstimado: number }>
  gastosCreados: number
  totalVentas: number
  comision: number
  comisionDetalle?: import('@/lib/comision-repartidor-calculo').ComisionRepartidor
  caja: {
    efectivoEsperado: number
    efectivoReal: number
    diferencia: number
    otrosPagos: number
    dineroEntregadoReportado: number
    sobranteFaltante: number
  }
  /** ADR-CIERRE-002 §5: avisos para revisar; nunca bloquean ni crean deuda. */
  senales?: Array<{ codigo: string; mensaje: string }>
  // BAMBU-LOG-006: true si este resultado viene de un replay offline-first
  // deduplicado por offlineId (el cierre real ya había ocurrido antes).
  deduped?: boolean
}
