/**
 * CancelarEmbarqueUseCase.
 *
 * Cancels an embarque (ABIERTO -> CANCELADO) and releases assigned pedidos.
 */

import type { IEmbarqueRepository } from '../../domain/repositories/IEmbarqueRepository'
import type { IPedidoEmbarqueRepository } from '../../domain/repositories/IPedidoEmbarqueRepository'
import { EmbarqueTransitionsService } from '../../domain/services/embarque-transitions.service'
import { EstadoEmbarque } from '../../domain/value-objects/EstadoEmbarque'
import type { CancelarEmbarqueInput } from '../dto'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'

export class CancelarEmbarqueUseCase {
  private readonly transitions = new EmbarqueTransitionsService()

  constructor(
    private readonly embarqueRepo: IEmbarqueRepository,
    private readonly pedidoRepo: IPedidoEmbarqueRepository,
    private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: CancelarEmbarqueInput): Promise<{ id: string; estado: string }> {
    return this.txManager.execute(async (tx) => {
      const embarque = await this.embarqueRepo.findById(input.id, tx)
      if (!embarque) {
        throw new Error('EMBARQUE_NOT_FOUND')
      }

      // Validate transition
      const result = this.transitions.cancelar(embarque.estado)
      if (!result.success) {
        throw new Error(result.error)
      }

      // Release assigned pedidos
      const pedidos = await this.pedidoRepo.findByEmbarqueId(input.id, tx)
      for (const pedido of pedidos) {
        await this.pedidoRepo.reassignToEmbarque(pedido.id, null, tx)
      }

      // Update state
      await this.embarqueRepo.update(
        input.id,
        { estado: new EstadoEmbarque(result.nuevoEstado) },
        tx,
      )

      return { id: input.id, estado: result.nuevoEstado }
    })
  }
}
