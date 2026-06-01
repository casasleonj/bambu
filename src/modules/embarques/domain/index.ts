/**
 * Embarques Domain Layer — Composition Root.
 *
 * Exports all domain entities, value objects, services, and repository interfaces.
 */

// Value Objects
export { EstadoEmbarque, type EstadoEmbarqueValue, ESTADOS_VALIDOS, ESTADOS_TERMINALES } from './value-objects/EstadoEmbarque'
export { Carga, type CargaData, type ProductCode, PRODUCT_CODES, PESOS_KG } from './value-objects/Carga'
export { EmbarqueId } from './value-objects/EmbarqueId'
export { CapacidadInfo, type CapacidadNivel, type CapacidadInfoData } from './value-objects/CapacidadInfo'

// Entities
export { Embarque, type EmbarqueProps } from './entities/Embarque'
export { EmbarqueProducto, type EmbarqueProductoProps } from './entities/EmbarqueProducto'
export { GastoEmbarque, type GastoEmbarqueProps } from './entities/GastoEmbarque'
export { VentaLibre, type VentaLibreProps } from './entities/VentaLibre'

// Domain Services
export { EmbarqueTransitionsService, type TransitionResult } from './services/embarque-transitions.service'
export {
  EmbarqueValidationService,
  type ValidationResult,
  MAX_UNIDADES,
  STOCK_OVERRIDE_TOLERANCE,
  STOCK_HARD_CAP,
  PESO_TOLERANCE,
} from './services/embarque-validation.service'
export {
  CierreEmbarqueService,
  type ProductoConciliacion,
  type DiscrepanciaResult,
  type ComisionResult,
  type CajaResult,
} from './services/cierre-embarque.service'
export {
  PrecioEmbarqueService,
  type IPrecioResolver,
  type PrecioResuelto,
  type ItemPrecio,
} from './services/precio-embarque.service'

// Repository Interfaces (Ports)
export { type IEmbarqueRepository, type EmbarqueFilter } from './repositories/IEmbarqueRepository'
export { type IEmbarqueProductoRepository } from './repositories/IEmbarqueProductoRepository'
export { type IGastoEmbarqueRepository } from './repositories/IGastoEmbarqueRepository'
export { type IVentaLibreRepository } from './repositories/IVentaLibreRepository'
export { type IPedidoEmbarqueRepository, type PedidoEmbarqueData } from './repositories/IPedidoEmbarqueRepository'
export { type ITrabajadorEmbarqueRepository, type TrabajadorEmbarqueData } from './repositories/ITrabajadorEmbarqueRepository'
export { type IStockEmbarqueRepository } from './repositories/IStockEmbarqueRepository'
