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
    // FIX 1.2 + Bloque 2: la desagregación por producto vive en ProduccionItem.
    // Usamos el campo almacenado `producido` (= promedio de conteoA y conteoB
    // calculado al cierre) y filtramos por la fecha de la Produccion padre.
    const items = await prisma.produccionItem.findMany({
      where: {
        produccion: { fecha: { gte: start, lt: end } },
      },
      select: {
        producto: true,
        producido: true,
        rotas: true,
        filtradas: true,
        consumoInterno: true,
      },
    })

    let aguaProducida = 0
    let hieloProducido = 0
    let perdidasAgua = 0
    let perdidasHielo = 0

    for (const item of items) {
      if (item.producto === 'PACA_AGUA') {
        aguaProducida += item.producido
        perdidasAgua += item.rotas + item.filtradas + item.consumoInterno
      } else if (item.producto === 'PACA_HIELO') {
        hieloProducido += item.producido
        perdidasHielo += item.rotas + item.filtradas + item.consumoInterno
      }
    }

    const piezasProducidas = aguaProducida + hieloProducido
    const perdidasTotales = perdidasAgua + perdidasHielo
    const eficiencia = piezasProducidas > 0
      ? Number(((piezasProducidas - perdidasTotales) / piezasProducidas * 100).toFixed(1))
      : 0

    return {
      aguaProducida,
      hieloProducido,
      perdidasAgua,
      perdidasHielo,
      piezasProducidas,
      perdidasTotales,
      eficiencia,
    }
  }
}
