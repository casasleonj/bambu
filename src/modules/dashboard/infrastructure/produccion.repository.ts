/**
 * Produccion Repository.
 *
 * Wraps Prisma queries for production data.
 */

import { prisma } from '@/shared/infrastructure'
import type { ProduccionDiaria } from '../domain'

export interface ProduccionRepository {
  aggregateByDateRange(start: Date, end: Date): Promise<ProduccionDiaria>
}

export class PrismaProduccionRepository implements ProduccionRepository {
  async aggregateByDateRange(start: Date, end: Date): Promise<ProduccionDiaria> {
    const result = await prisma.produccion.aggregate({
      where: { fecha: { gte: start, lt: end } },
      _sum: {
        conteoAAgua: true,
        conteoBAgua: true,
        conteoAHielo: true,
        conteoBHielo: true,
        rotasAgua: true,
        rotasHielo: true,
        filtradasAgua: true,
        filtradasHielo: true,
        consumoInternoAgua: true,
        consumoInternoHielo: true,
      },
    })

    const aguaProducida = (result._sum?.conteoAAgua || 0) + (result._sum?.conteoBAgua || 0)
    const hieloProducido = (result._sum?.conteoAHielo || 0) + (result._sum?.conteoBHielo || 0)
    const perdidasAgua =
      (result._sum?.rotasAgua || 0) +
      (result._sum?.filtradasAgua || 0) +
      (result._sum?.consumoInternoAgua || 0)
    const perdidasHielo =
      (result._sum?.rotasHielo || 0) +
      (result._sum?.filtradasHielo || 0) +
      (result._sum?.consumoInternoHielo || 0)

    return { aguaProducida, hieloProducido, perdidasAgua, perdidasHielo }
  }
}
