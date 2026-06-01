/**
 * PrismaGastoEmbarqueRepository.
 *
 * Prisma implementation of IGastoEmbarqueRepository.
 */

import { prisma } from '@/lib/prisma'
import { GastoEmbarque } from '../../domain/entities/GastoEmbarque'
import type { IGastoEmbarqueRepository } from '../../domain/repositories/IGastoEmbarqueRepository'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

type TxOrPrisma = TransactionClient | typeof prisma

function getTx(tx: unknown): TxOrPrisma {
  return (tx as TxOrPrisma) ?? prisma
}

function toNumber(value: number | { toNumber: () => number }): number {
  return typeof value === 'number' ? value : value.toNumber()
}

export class PrismaGastoEmbarqueRepository implements IGastoEmbarqueRepository {
  async findByEmbarqueId(embarqueId: string, tx?: unknown): Promise<GastoEmbarque[]> {
    const client = getTx(tx)
    const raw = await client.gasto.findMany({
      where: { embarqueId },
    })

    return raw.map((g) => new GastoEmbarque({
      id: g.id,
      embarqueId: g.embarqueId!,
      categoria: g.categoria,
      descripcion: g.descripcion,
      monto: toNumber(g.monto),
      responsable: g.responsable ?? undefined,
      notas: g.notas ?? undefined,
    }))
  }

  async create(
    data: {
      embarqueId: string
      categoria: string
      descripcion: string
      monto: number
      responsable?: string
      notas?: string
      createdById?: string
    },
    tx?: unknown,
  ): Promise<GastoEmbarque> {
    const client = getTx(tx)
    const raw = await client.gasto.create({
      data: {
        embarqueId: data.embarqueId,
        categoria: data.categoria,
        descripcion: data.descripcion,
        monto: data.monto,
        responsable: data.responsable ?? null,
        notas: data.notas ?? null,
        createdById: data.createdById ?? null,
      },
    })

    return new GastoEmbarque({
      id: raw.id,
      embarqueId: raw.embarqueId!,
      categoria: raw.categoria,
      descripcion: raw.descripcion,
      monto: toNumber(raw.monto),
      responsable: raw.responsable ?? undefined,
      notas: raw.notas ?? undefined,
    })
  }

  async delete(id: string, tx?: unknown): Promise<void> {
    const client = getTx(tx)
    await client.gasto.delete({ where: { id } })
  }
}
