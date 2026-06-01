/**
 * INotaCreditoRepository — Domain Port.
 */

import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'

export interface NotaCreditoData {
  numero: string
  pedidoId: string
  facturaId?: string
  monto: number
  motivo: string
  creadoPor?: string
}

export interface INotaCreditoRepository {
  create(data: NotaCreditoData, tx?: TransactionClient): Promise<void>
}
