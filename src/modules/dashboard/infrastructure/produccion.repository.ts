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
    // FIX 1.2: usa los campos almacenados prodAgua/prodHielo (promedio de A y B)
    // en lugar de sumar los conteos por separado (que duplicaba la producción).
    const result = await prisma.produccion.aggregate({
      where: { fecha: { gte: start, lt: end } },
      _sum: {
        prodAgua: true,
        prodHielo: true,
        rotasAgua: true,
        rotasHielo: true,
        filtradasAgua: true,
        filtradasHielo: true,
        consumoInternoAgua: true,
        consumoInternoHielo: true,
      },
    })

    const aguaProducida = result._sum?.prodAgua || 0
    const hieloProducido = result._sum?.prodHielo || 0
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
