/**
 * Config & Cierre Repository.
 *
 * Wraps Prisma queries for configuration and daily close data.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/shared/infrastructure'
import { leerBaseDelDia } from '@/lib/base-caja-dia'

export interface CierreData {
  stockFinAgua: number | null
  stockFinHielo: number | null
}

export interface ConfigRepository {
  getBaseDia(todayKey: string): Promise<number>
  getStockConfigs(): Promise<Record<string, string>>
  getLastCierre(): Promise<CierreData | null>
}

export class PrismaConfigRepository implements ConfigRepository {
  constructor(
    private readonly db: Pick<
      Prisma.TransactionClient,
      'config' | 'cierreDia'
    > = prisma,
  ) {}
  async getBaseDia(todayKey: string): Promise<number> {
    // #748/#688: no heredar BASE_DIA global ni la base de ayer.
    // La autoridad de la fecha es el mismo lector que usa el Cierre.
    const fecha = todayKey.replace(/^BASE_DIA_/, '')
    return (await leerBaseDelDia(this.db, fecha))?.valor ?? 0
  }

  async getStockConfigs(): Promise<Record<string, string>> {
    // NOTA: STOCK_INI_BOTELLON eliminado — botellones son passthrough.
    const configs = await this.db.config.findMany({
      where: { clave: { in: ['STOCK_INI_AGUA', 'STOCK_INI_HIELO'] } },
    })
    return Object.fromEntries(configs.map((c) => [c.clave, c.valor]))
  }

  async getLastCierre(): Promise<CierreData | null> {
    const cierre = await this.db.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
      select: { stockFinAgua: true, stockFinHielo: true },
    })
    return cierre ?? null
  }
}
