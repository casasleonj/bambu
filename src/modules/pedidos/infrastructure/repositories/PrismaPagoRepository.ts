/**
 * PrismaPagoRepository.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { datosConfirmacionInicial } from '@/lib/pago-confirmacion'
import type { IPagoRepository } from '../../domain/repositories/IPagoRepository'
import type { PagoData } from '../../domain/types'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

export class PrismaPagoRepository implements IPagoRepository {
  async findByPedidoId(pedidoId: string, tx?: TransactionClient): Promise<PagoData[]> {
    const client = tx || prisma
    const raw = await client.pago.findMany({
      where: { pedidoId },
    })
    return raw.map(p => ({
      metodo: p.metodo as PagoData['metodo'],
      monto: typeof p.monto === 'number' ? p.monto : (p.monto as { toNumber: () => number }).toNumber(),
    }))
  }

  async createMany(pedidoId: string, pagos: PagoData[], tx?: TransactionClient): Promise<void> {
    const client = tx || prisma
    if (pagos.length === 0) return
    await client.pago.createMany({
      // ADR-PAGO-REPORTADO-CONFIRMADO-001: clasificación inicial por método.
      data: pagos.map(p => ({
        pedidoId,
        metodo: p.metodo,
        monto: p.monto,
        ...datosConfirmacionInicial(p.metodo),
      })) as unknown as Prisma.PagoCreateManyInput[],
    })
  }
}
