/**
 * Config & Cierre Repository.
 *
 * Wraps Prisma queries for configuration and daily close data.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/shared/infrastructure'

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
    const [todayConfig, globalConfig] = await Promise.all([
      this.db.config.findUnique({ where: { clave: todayKey } }),
      this.db.config.findUnique({ where: { clave: 'BASE_DIA' } }),
    ])

    const raw = todayConfig
      ? parseFloat(todayConfig.valor)
      : globalConfig
        ? parseFloat(globalConfig.valor)
        : 0

    return isNaN(raw) ? 0 : raw
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
