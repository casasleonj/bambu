/**
 * StockValidator.
 *
 * Infrastructure service for stock validation during embarque creation/update.
 * Implements IStockEmbarqueRepository port.
 * Delegates to the existing stock library.
 */

import { getStockDisponible } from '@/lib/stock'
import { prisma } from '@/lib/prisma'
import type { IStockEmbarqueRepository } from '../../domain/repositories/IStockEmbarqueRepository'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

type TxOrPrisma = TransactionClient | typeof prisma

function getTx(tx: unknown): TxOrPrisma {
  return (tx as TxOrPrisma) ?? prisma
}

export class StockValidator implements IStockEmbarqueRepository {
  async getStockEstimado(_fecha: Date, _tx?: unknown): Promise<Record<string, number> | null> {
    // Delegates to the existing stock library
    const stockResult = await getStockDisponible()
    if (!stockResult.tieneEstimado) return null

    // Convert StockSnapshot to Record<string, number>
    const snapshot = stockResult.stock
    return {
      PACA_AGUA: snapshot.PACA_AGUA,
      PACA_HIELO: snapshot.PACA_HIELO,
      BOTELLON: snapshot.BOTELLON,
      BOLSA_AGUA: snapshot.BOLSA_AGUA,
      BOLSA_HIELO: snapshot.BOLSA_HIELO,
    }
  }

  async getStockSnapshot(embarqueId: string, tx?: unknown): Promise<Record<string, number> | null> {
    const client = getTx(tx)
    const embarque = await client.embarque.findUnique({
      where: { id: embarqueId },
      select: { stockSnapshot: true },
    })

    if (!embarque?.stockSnapshot) return null

    return embarque.stockSnapshot as Record<string, number>
  }
}
