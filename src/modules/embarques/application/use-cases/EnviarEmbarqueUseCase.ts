/**
 * EnviarEmbarqueUseCase.
 *
 * Transitions embarque from ABIERTO to EN_RUTA.
 */

import type { IEmbarqueRepository } from '../../domain/repositories/IEmbarqueRepository'
import { EmbarqueTransitionsService } from '../../domain/services/embarque-transitions.service'
import { EstadoEmbarque } from '../../domain/value-objects/EstadoEmbarque'
import type { EnviarEmbarqueInput, EmbarqueDetalleDTO } from '../dto'
import { EmbarqueDTOMapper } from '../dto/EmbarqueDTOMapper'

export class EnviarEmbarqueUseCase {
  private readonly transitions = new EmbarqueTransitionsService()

  constructor(private readonly embarqueRepo: IEmbarqueRepository) {}

  async execute(input: EnviarEmbarqueInput): Promise<EmbarqueDetalleDTO> {
    const embarque = await this.embarqueRepo.findById(input.id)
    if (!embarque) {
      throw new Error('EMBARQUE_NOT_FOUND')
    }

    // Validate transition
    const result = this.transitions.enviar(embarque.estado)
    if (!result.success) {
      throw new Error(result.error)
    }

    // Update state
    const updated = await this.embarqueRepo.update(input.id, {
      estado: new EstadoEmbarque(result.nuevoEstado),
      horaSalida: new Date(),
    })

    return EmbarqueDTOMapper.toDetalle(updated)
  }
}
