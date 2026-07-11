/**
 * IPedidoRepository — Domain Port.
 *
 * Contract for Pedido persistence. Implementation lives in infrastructure.
 */

import type { Pedido } from '../entities/Pedido'
import type { PedidoId } from '../value-objects/PedidoId'

export interface PedidoFilter {
  clienteId?: string
  desde?: Date
  hasta?: Date
  estadoEntrega?: string[]
  estadoPago?: string[]
  origen?: string[]
  embarqueId?: string
  tipo?: string[]
}

import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'

export interface IPedidoRepository {
  findById(id: PedidoId, tx?: TransactionClient): Promise<Pedido | null>
  findByNumero(numero: number, tx?: TransactionClient): Promise<Pedido | null>
  findByOfflineId(offlineId: string, tx?: TransactionClient): Promise<Pedido | null>
  findMany(filter?: PedidoFilter, options?: { take?: number; skip?: number; orderBy?: 'asc' | 'desc' }, tx?: TransactionClient): Promise<Pedido[]>
  count(filter?: PedidoFilter, tx?: TransactionClient): Promise<number>
  save(pedido: Pedido, tx?: TransactionClient, options?: { offlineId?: string }): Promise<Pedido>
  update(pedido: Pedido, tx?: TransactionClient): Promise<Pedido>

  /**
   * Find delivered-but-unpaid orders for a customer.
   * These are the orders that count against the customer's fiado limit.
   */
  findPendingByCliente(clienteId: string, tx?: TransactionClient): Promise<Array<{ id: string; numero: number; saldo: number }>>

  /**
   * Count orders for a customer on a specific date.
   */
  countByClienteAndDate(clienteId: string, date: Date, tx?: TransactionClient): Promise<number>
}
