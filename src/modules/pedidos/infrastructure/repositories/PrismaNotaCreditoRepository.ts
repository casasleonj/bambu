/**
 * PrismaNotaCreditoRepository.
 */

import { prisma } from '@/lib/prisma'
import type { INotaCreditoRepository, NotaCreditoData } from '../../domain/repositories/INotaCreditoRepository'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

export class PrismaNotaCreditoRepository implements INotaCreditoRepository {
  async create(data: NotaCreditoData, tx?: TransactionClient): Promise<void> {
    const client = tx || prisma
    await client.notaCredito.create({
      data: {
        numero: data.numero,
        pedidoId: data.pedidoId,
        facturaId: data.facturaId || null,
        monto: data.monto,
        motivo: data.motivo,
        creadoPor: data.creadoPor || null,
      } as unknown as Parameters<typeof client.notaCredito.create>[0]['data'],
    })
  }
}
