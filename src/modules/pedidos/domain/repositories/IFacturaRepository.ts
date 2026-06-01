/**
 * IFacturaRepository — Domain Port.
 *
 * Contract for Factura persistence related to Pedidos.
 */

import type { FacturaSnapshot } from '../types'
import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'

export interface IFacturaRepository {
  findByPedidoId(pedidoId: string, tx?: TransactionClient): Promise<FacturaSnapshot | null>
  create(factura: FacturaSnapshot, pedidoId: string, clienteId: string, tx?: TransactionClient): Promise<FacturaSnapshot>
  update(factura: FacturaSnapshot, tx?: TransactionClient): Promise<FacturaSnapshot>
  anularByPedidoId(pedidoId: string, tx?: TransactionClient): Promise<void>
}
