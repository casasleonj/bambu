/**
 * PrismaEmbarqueProductoRepository.
 *
 * Prisma implementation of IEmbarqueProductoRepository.
 */

import { prisma } from '@/lib/prisma'
import { EmbarqueProducto } from '../../domain/entities/EmbarqueProducto'
import type { IEmbarqueProductoRepository } from '../../domain/repositories/IEmbarqueProductoRepository'
import type { ProductCode } from '../../domain/value-objects/Carga'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

type TxOrPrisma = TransactionClient | typeof prisma

function getTx(tx: unknown): TxOrPrisma {
  return (tx as TxOrPrisma) ?? prisma
}

export class PrismaEmbarqueProductoRepository implements IEmbarqueProductoRepository {
  async findByEmbarqueId(embarqueId: string, tx?: unknown): Promise<EmbarqueProducto[]> {
    const client = getTx(tx)
    const raw = await client.embarqueProducto.findMany({
      where: { embarqueId },
    })

    return raw.map(
      (p) =>
        new EmbarqueProducto({
          id: p.id,
          embarqueId: p.embarqueId,
          producto: p.producto as ProductCode,
          cargadas: p.cargadas,
          devueltas: p.devueltas,
          cambios: p.cambios,
          rotas: p.rotas,
        }),
    )
  }

  async create(
    data: {
      embarqueId: string
      producto: ProductCode
      cargadas: number
      devueltas: number
      cambios: number
      rotas: number
    },
    tx?: unknown,
  ): Promise<EmbarqueProducto> {
    const client = getTx(tx)
    const raw = await client.embarqueProducto.create({
      data,
    })

    return new EmbarqueProducto({
      id: raw.id,
      embarqueId: raw.embarqueId,
      producto: raw.producto as ProductCode,
      cargadas: raw.cargadas,
      devueltas: raw.devueltas,
      cambios: raw.cambios,
      rotas: raw.rotas,
    })
  }

  async update(
    id: string,
    data: Partial<{ cargadas: number; devueltas: number; cambios: number; rotas: number }>,
    tx?: unknown,
  ): Promise<EmbarqueProducto> {
    const client = getTx(tx)
    const raw = await client.embarqueProducto.update({
      where: { id },
      data,
    })

    return new EmbarqueProducto({
      id: raw.id,
      embarqueId: raw.embarqueId,
      producto: raw.producto as ProductCode,
      cargadas: raw.cargadas,
      devueltas: raw.devueltas,
      cambios: raw.cambios,
      rotas: raw.rotas,
    })
  }

  async upsert(
    embarqueId: string,
    producto: ProductCode,
    data: { cargadas: number; devueltas: number; cambios: number; rotas: number },
    tx?: unknown,
  ): Promise<EmbarqueProducto> {
    const client = getTx(tx)
    const raw = await client.embarqueProducto.upsert({
      where: {
        embarqueId_producto: { embarqueId, producto },
      },
      create: {
        embarqueId,
        producto,
        ...data,
      },
      update: data,
    })

    return new EmbarqueProducto({
      id: raw.id,
      embarqueId: raw.embarqueId,
      producto: raw.producto as ProductCode,
      cargadas: raw.cargadas,
      devueltas: raw.devueltas,
      cambios: raw.cambios,
      rotas: raw.rotas,
    })
  }
}
