/**
 * ListarEmbarquesUseCase.
 *
 * Lists embarques with optional filters.
 */

import type { IEmbarqueRepository, EmbarqueFilter } from '../../domain/repositories/IEmbarqueRepository'
import type { ListarEmbarquesInput, EmbarqueResumenDTO } from '../dto'
import { EmbarqueDTOMapper } from '../dto/EmbarqueDTOMapper'

export class ListarEmbarquesUseCase {
  constructor(private readonly embarqueRepo: IEmbarqueRepository) {}

  async execute(input: ListarEmbarquesInput): Promise<{ embarques: EmbarqueResumenDTO[]; total: number }> {
    const filters: EmbarqueFilter = {
      fechaDesde: input.fechaDesde,
      fechaHasta: input.fechaHasta,
      estado: input.estado,
      trabajadorId: input.trabajadorId,
      rutaId: input.rutaId,
    }

    const embarques = await this.embarqueRepo.findMany(filters)
    const dtos = embarques.map((e) => EmbarqueDTOMapper.toResumen(e))

    return { embarques: dtos, total: dtos.length }
  }
}
