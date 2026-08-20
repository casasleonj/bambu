/**
 * Embarques Application Layer — Composition Root.
 *
 * Exports all use cases and DTOs.
 */

// DTOs
export type {
  CrearEmbarqueInput,
  CancelarEmbarqueInput,
  CerrarEmbarqueInput,
  GestionarGastoInput,
  EmbarqueResumenDTO,
  EmbarqueDetalleDTO,
  CierreResultadoDTO,
} from './dto'
export { EmbarqueDTOMapper } from './dto/EmbarqueDTOMapper'

// Use Cases
export { CrearEmbarqueUseCase } from './use-cases/CrearEmbarqueUseCase'
export { CancelarEmbarqueUseCase } from './use-cases/CancelarEmbarqueUseCase'
export { CerrarEmbarqueUseCase } from './use-cases/CerrarEmbarqueUseCase'
