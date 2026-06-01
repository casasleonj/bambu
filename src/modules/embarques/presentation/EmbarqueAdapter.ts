/**
 * EmbarqueAdapter.
 *
 * Presentation adapter that converts Domain Entities to legacy-shaped objects
 * expected by existing API consumers and UI components.
 *
 * This is the bridge between the DDD domain model and the legacy flat structure.
 */

import type { Embarque } from '../domain/entities/Embarque'
import type { EmbarqueResumenDTO, EmbarqueDetalleDTO } from '../application/dto'
import { EmbarqueDTOMapper } from '../application/dto/EmbarqueDTOMapper'

export class EmbarqueAdapter {
  /**
   * Converts an Embarque entity to the legacy API response shape.
   * Maintains backward compatibility with existing UI components.
   */
  static toLegacyResponse(embarque: Embarque): EmbarqueResumenDTO {
    return EmbarqueDTOMapper.toResumen(embarque)
  }

  /**
   * Converts an Embarque entity with full details (productos, gastos, pedidos).
   */
  static toLegacyDetail(embarque: Embarque, pedidosCount: number = 0): EmbarqueDetalleDTO {
    return EmbarqueDTOMapper.toDetalle(embarque, pedidosCount)
  }

  /**
   * Converts a list of Embarque entities to the legacy list response shape.
   */
  static toLegacyList(embarques: Embarque[]): EmbarqueResumenDTO[] {
    return embarques.map((e) => EmbarqueDTOMapper.toResumen(e))
  }
}
