/**
 * ActualizarEmbarqueUseCase.
 *
 * Updates an embarque with state-gated field restrictions.
 * Only ABIERTO embarques can have trabajadorId, rutaId, horaSalida,
 * baseDinero, tipoMoto, or carga modified.
 */

import type { IEmbarqueRepository } from '../../domain/repositories/IEmbarqueRepository'
import type { ITrabajadorEmbarqueRepository } from '../../domain/repositories/ITrabajadorEmbarqueRepository'
import type { IStockEmbarqueRepository } from '../../domain/repositories/IStockEmbarqueRepository'
import { EmbarqueValidationService } from '../../domain/services/embarque-validation.service'
import { Carga } from '../../domain/value-objects/Carga'
import type { ActualizarEmbarqueInput, EmbarqueDetalleDTO } from '../dto'
import { EmbarqueDTOMapper } from '../dto/EmbarqueDTOMapper'

export class ActualizarEmbarqueUseCase {
  private readonly validation = new EmbarqueValidationService()

  constructor(
    private readonly embarqueRepo: IEmbarqueRepository,
    private readonly trabajadorRepo: ITrabajadorEmbarqueRepository,
    private readonly stockRepo: IStockEmbarqueRepository,
  ) {}

  async execute(input: ActualizarEmbarqueInput): Promise<EmbarqueDetalleDTO> {
    const embarque = await this.embarqueRepo.findById(input.id)
    if (!embarque) {
      throw new Error('EMBARQUE_NOT_FOUND')
    }

    // Determine which fields are being modified
    const camposAModificar: string[] = []
    if (input.trabajadorId) camposAModificar.push('trabajadorId')
    if (input.rutaId !== undefined) camposAModificar.push('rutaId')
    if (input.horaSalida) camposAModificar.push('horaSalida')
    if (input.baseDinero !== undefined) camposAModificar.push('baseDinero')
    if (input.tipoMoto) camposAModificar.push('tipoMoto')
    if (input.carga) camposAModificar.push('carga')

    // Validate state-gated edits
    const editValidation = this.validation.validarEdicionPorEstado(
      embarque.estado,
      camposAModificar,
    )
    if (!editValidation.valid) {
      throw new Error(editValidation.errors.join(', '))
    }

    // Build update data
    const updateData: Parameters<typeof this.embarqueRepo.update>[1] = {}

    if (input.trabajadorId) {
      const trabajador = await this.trabajadorRepo.findById(input.trabajadorId)
      if (!trabajador) {
        throw new Error('TRABAJADOR_NOT_FOUND')
      }
      if (!trabajador.usaMoto) {
        throw new Error('El trabajador no tiene moto asignada')
      }
      updateData.trabajadorId = input.trabajadorId
    }

    if (input.rutaId !== undefined) updateData.rutaId = input.rutaId
    if (input.horaSalida) updateData.horaSalida = input.horaSalida
    if (input.baseDinero !== undefined) updateData.baseDinero = input.baseDinero
    if (input.tipoMoto !== undefined) updateData.tipoMoto = input.tipoMoto
    if (input.codigoVisita !== undefined) updateData.codigoVisita = input.codigoVisita
    if (input.obs !== undefined) updateData.obs = input.obs

    if (input.carga) {
      const carga = new Carga(input.carga)

      // Validate max units
      const unitsValidation = this.validation.validarMaxUnidades(carga)
      if (!unitsValidation.valid) {
        throw new Error(unitsValidation.errors.join(', '))
      }

      // Validate weight capacity
      const capacidadKg = embarque.capacidadKg
      const weightValidation = this.validation.validarCapacidadPeso(carga, capacidadKg)
      if (!weightValidation.valid) {
        throw new Error(weightValidation.errors.join(', '))
      }

      // Validate stock
      const stock = await this.stockRepo.getStockEstimado(new Date())
      const stockValidation = this.validation.validarStock(carga, stock)
      if (!stockValidation.valid) {
        throw new Error(`STOCK_INSUFFICIENT: ${stockValidation.errors.join(', ')}`)
      }

      updateData.carga = carga
    }

    const updated = await this.embarqueRepo.update(input.id, updateData)
    return EmbarqueDTOMapper.toDetalle(updated)
  }
}
