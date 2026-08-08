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

    // Cuando all=true, el caller (cache-driven UI) puede pedir un pageSize
    // más grande que el default de paginación. Cap duro de 1000 como techo
    // de seguridad independiente de lo que llegue del cliente.
    const takeLimit = input.all
      ? Math.min(Math.max(input.pageSize || 200, 1), 1000)
      : (input.pageSize || 20)
    const options = input.all
      ? { take: takeLimit }
      : { take: takeLimit, skip: ((input.page || 1) - 1) * takeLimit }

    const pedidos = await this.pedidoRepo.findMany(filter, { ...options, orderBy: 'desc' })

    // Cuando all=true, `pedidos.length` es el total exacto salvo que se haya
    // truncado en el tope (pedidos.length === takeLimit); en ese caso, y solo
    // en ese caso, se paga un COUNT(*) para saber el total real. Evita pagar
    // el costo de COUNT(*) en el caso común (no truncado).
    const total = input.all
      ? (pedidos.length === takeLimit ? await this.pedidoRepo.count(filter) : pedidos.length)
      : await this.pedidoRepo.count(filter)

    return {
      pedidos: pedidos.map(p => PedidoDTOMapper.toResumen(p)),
      total,
    }
  }
}
