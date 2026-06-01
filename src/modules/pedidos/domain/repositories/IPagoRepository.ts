/**
 * IPagoRepository — Domain Port.
 *
 * Contract for Pago persistence.
 */

import type { PagoData } from '../types'
import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'

export interface IPagoRepository {
  findByPedidoId(pedidoId: string, tx?: TransactionClient): Promise<PagoData[]>
  createMany(pedidoId: string, pagos: PagoData[], tx?: TransactionClient): Promise<void>
}
