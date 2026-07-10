/**
 * GetFiadoStatusUseCase.
 *
 * Returns the current "fiado" (credit) status for a customer:
 * count of pending delivered orders with balance, effective limit,
 * and derived UI level ('ok' | 'cerca' | 'limite').
 */

import { CANONICAL_CONSUMIDOR_FINAL_ID, LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { getConfigInt } from '@/lib/config'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import {
  resolverLimiteFiados,
  getEstadoFiados,
} from '../../domain/services/pedido-validation.service'
import type { FiadoStatus } from '../../domain/types'

export class ClienteNotFoundError extends Error {
  constructor(clienteId: string) {
    super(`Cliente not found: ${clienteId}`)
    this.name = 'ClienteNotFoundError'
  }
}

export interface GetFiadoStatusInput {
  clienteId: string
}

export class GetFiadoStatusUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private clienteRepo: IClienteRepository,
  ) {}

  async execute(input: GetFiadoStatusInput): Promise<FiadoStatus> {
    const { clienteId } = input

    // Anonymous sales never have a fiado limit.
    if (clienteId === CANONICAL_CONSUMIDOR_FINAL_ID) {
      return { count: 0, limite: 0, nivel: 'ok', pedidos: [] }
    }

    const cliente = await this.clienteRepo.findById(clienteId)
    if (!cliente) {
      throw new ClienteNotFoundError(clienteId)
    }

    const [pedidosPendientes, limiteGlobal] = await Promise.all([
      this.pedidoRepo.findPendingByCliente(clienteId),
      getConfigInt('LIMITE_PEDIDOS_FIADOS_DEFAULT', LIMITE_FIADOS_DEFAULT),
    ])

    const limite = resolverLimiteFiados(
      { limitePedidosFiados: cliente.limitePedidosFiados },
      String(limiteGlobal),
      LIMITE_FIADOS_DEFAULT,
    )

    const { nivel } = getEstadoFiados(pedidosPendientes, limite)

    return {
      count: pedidosPendientes.length,
      limite,
      nivel,
      pedidos: pedidosPendientes,
    }
  }
}
