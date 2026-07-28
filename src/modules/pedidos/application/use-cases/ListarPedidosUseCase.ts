/**
 * ListarPedidosUseCase.
 */

import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { ListarPedidosInput, PedidoResumenDTO } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'

export class ListarPedidosUseCase {
  constructor(private pedidoRepo: IPedidoRepository) {}

  async execute(input: ListarPedidosInput): Promise<{ pedidos: PedidoResumenDTO[]; total: number }> {
    const filter = {
      clienteId: input.clienteId,
      desde: input.desde,
      hasta: input.hasta,
      estadoEntrega: input.estadoEntrega,
      estadoPago: input.estadoPago,
      origen: input.origen,
      embarqueId: input.embarqueId,
      tipo: input.tipo,
      scope: input.scope,
    }

    const options = input.all
      ? { take: 200 }
      : { take: input.pageSize || 20, skip: ((input.page || 1) - 1) * (input.pageSize || 20) }

    // Cuando all=true el cliente nunca consume `total` (usa pedidos.length).
    // Skip COUNT(*) para evitar full table scan en PostgreSQL.
    const [pedidos, total] = input.all
      ? [await this.pedidoRepo.findMany(filter, { ...options, orderBy: 'desc' }), 0]
      : await Promise.all([
          this.pedidoRepo.findMany(filter, { ...options, orderBy: 'desc' }),
          this.pedidoRepo.count(filter),
        ])

    return {
      pedidos: pedidos.map(p => PedidoDTOMapper.toResumen(p)),
      total,
    }
  }
}
