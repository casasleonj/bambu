import type { ImportEntity, ImportDecision } from '@prisma/client'

/**
 * Tipos centrales para el módulo de importación histórica.
 *
 * Flujo:
 *   RawRow (parser) → NormalizedXxx (normalizer) → validación → staging DB
 *   → matcher → ImportMatchCandidate[] → decisión → commit.
 */

export type { ImportEntity, ImportDecision }

export const IMPORT_ENTITIES = [
  'CLIENTE',
  'PEDIDO',
  'PAGO',
  'EMBARQUE',
  'PRODUCCION',
  'GASTO',
  'CIERRE',
  'PROVEEDOR',
  'INSUMO',
  'COMPRA',
  'NOMINA',
] as const satisfies ImportEntity[]

export type ImportEntityValue = (typeof IMPORT_ENTITIES)[number]

export interface RawRow {
  [key: string]: string | number | boolean | null | undefined
}

export interface ParsedSheet<T = RawRow> {
  name: string
  rows: T[]
  errors: ParseError[]
}

export interface ParseError {
  row: number
  column?: string
  message: string
}

export interface SheetConfig {
  /** Lista de hojas que esperamos encontrar en el archivo. */
  expectedSheets: ExpectedSheet[]
  /** Formato de fecha que usará el normalizador. */
  dateFormat: 'DD/MM/AAAA' | 'MM/DD/AAAA' | 'YYYY-MM-DD'
  /** Zona horaria para fechas/horas sin offset. */
  timeZone: string
}

export interface ExpectedSheet {
  entity: ImportEntity
  /** Nombres aceptados para la hoja (case-insensitive). */
  aliases: string[]
  /** Columnas requeridas. */
  requiredColumns: string[]
  /** Columnas opcionales. */
  optionalColumns: string[]
}

export interface NormalizedCliente {
  entity: 'CLIENTE'
  nombre: string
  apellido?: string
  telefono: string
  direccion?: string
  barrio?: string
  referencia?: string
  linkUbicacion?: string
  nombreNegocio?: string
  tipoNegocio?: string
  horaApertura?: string
  preciosEspeciales?: string
  contactos: NormalizedContacto[]
  notas?: string
}

export interface NormalizedContacto {
  nombre: string
  telefono: string
  relacion?: string
}

export interface NormalizedPedidoItem {
  producto: string
  cantPedido: number
  precio?: number
}

export interface NormalizedPedido {
  entity: 'PEDIDO'
  clienteTelefono?: string
  clienteNombre?: string
  fecha: Date
  fechaEntrega?: Date
  origen?: string
  items: NormalizedPedidoItem[]
  totalPagado?: number
  obs?: string
}

export interface NormalizedPago {
  entity: 'PAGO'
  clienteTelefono?: string
  clienteNombre?: string
  fecha: Date
  monto: number
  metodo: string
  pedidoNumero?: string
  notas?: string
}

export interface NormalizedGasto {
  entity: 'GASTO'
  fecha: Date
  categoria?: string
  descripcion: string
  monto: number
  responsable?: string
  notas?: string
}

export interface NormalizedEmbarque {
  entity: 'EMBARQUE'
  fecha: Date
  repartidorNombre?: string
  rutaNombre?: string
  horaSalida?: string
  horaLlegada?: string
  pacasAgua?: number
  pacasHielo?: number
  devueltasAgua?: number
  devueltasHielo?: number
  rotasAgua?: number
  rotasHielo?: number
  baseDinero?: number
  dineroEntregado?: number
  obs?: string
}

export interface NormalizedProduccionItem {
  producto: string
  conteoA?: number
  conteoB?: number
  stockIni?: number
  ventas?: number
  filtradas?: number
  rotas?: number
  consumoInterno?: number
  stockFinFisico?: number
}

export interface NormalizedProduccion {
  entity: 'PRODUCCION'
  fecha: Date
  turno: string
  trabajadorNombre?: string
  items: NormalizedProduccionItem[]
  obs?: string
}

export interface NormalizedCierre {
  entity: 'CIERRE'
  fecha: Date
  numPedidos?: number
  totalVentas?: number
  totalVentaRapida?: number
  totalPedido?: number
  totalVentaLibre?: number
  fiadoVentaRapida?: number
  fiadoPedido?: number
  fiadoVentaLibre?: number
  aguaVendida?: number
  hieloVendido?: number
  botellonVendido?: number
  bolsaAguaVendida?: number
  bolsaHieloVendida?: number
  cobrado?: number
  fiado?: number
  efectivo?: number
  nequi?: number
  daviplata?: number
  transferencia?: number
  bono?: number
  baseDia?: number
  comisiones?: number
  salarios?: number
  gastos?: number
  stockIniAgua?: number
  prodAgua?: number
  stockFinAgua?: number
  stockIniHielo?: number
  prodHielo?: number
  stockFinHielo?: number
  netoCaja?: number
  cerradoPor?: string
  horaCierre?: string
}

export interface NormalizedProveedor {
  entity: 'PROVEEDOR'
  nombre: string
  nit?: string
  telefono?: string
  email?: string
  direccion?: string
  contacto?: string
  tipoProducto?: string
  observaciones?: string
}

export interface NormalizedInsumo {
  entity: 'INSUMO'
  nombre: string
  unidad: string
  stock?: number
  stockMinimo?: number
  precioUnitario?: number
}

export interface NormalizedCompra {
  entity: 'COMPRA'
  fecha: Date
  proveedorNombre?: string
  proveedorNit?: string
  insumoNombre: string
  cantidad: number
  costoUnitario: number
  numeroFactura?: string
}

export interface NormalizedNomina {
  entity: 'NOMINA'
  fecha: Date
  trabajadorNombre: string
  monto: number
  notas?: string
}

export type NormalizedEntity =
  | NormalizedCliente
  | NormalizedPedido
  | NormalizedPago
  | NormalizedEmbarque
  | NormalizedProduccion
  | NormalizedGasto
  | NormalizedCierre
  | NormalizedProveedor
  | NormalizedInsumo
  | NormalizedCompra
  | NormalizedNomina

export interface ImportMatchCandidate {
  /** id del registro canónico existente. */
  targetId: string
  /** 0.0 - 1.0. ≥1.0 = match exacto. */
  score: number
  /** Explicación legible para el usuario. */
  reason: string
  /** Datos del candidato para mostrar en UI. */
  target: MatchTargetPreview
}

export interface MatchTargetPreview {
  id: string
  nombre: string
  telefono?: string | null
  direccion?: string | null
  barrio?: string | null
  nombreNegocio?: string | null
}

export interface NormalizedRowWithErrors<T extends NormalizedEntity = NormalizedEntity> {
  normalized?: T
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationWarning {
  field: string
  message: string
}

export interface WorkerPaymentDetection {
  isPayment: boolean
  matchedKeywords: string[]
  suggestedCategory: 'PAGO_PERSONAL' | string
}
