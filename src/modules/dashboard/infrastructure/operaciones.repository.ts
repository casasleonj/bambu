/**
 * Gastos & Embarques Repositories.
 *
 * Wraps Prisma queries for expenses and shipments.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/shared/infrastructure'

export interface GastosRepository {
  sumByDateRange(start: Date, end: Date): Promise<number>
}

export interface EmbarquesRepository {
  countAbiertos(): Promise<number>
}

export class PrismaGastosRepository implements GastosRepository {
  constructor(
    private readonly db: Pick<Prisma.TransactionClient, 'gasto'> = prisma,
  ) {}
  async sumByDateRange(start: Date, end: Date): Promise<number> {
    const result = await this.db.gasto.aggregate({
      where: { fecha: { gte: start, lt: end } },
      _sum: { monto: true },
    })
    return Number(result._sum.monto) || 0
  }
}

export class PrismaEmbarquesRepository implements EmbarquesRepository {
  async countAbiertos(): Promise<number> {
    return prisma.embarque.count({ where: { estado: 'ABIERTO' } })
  }
}
