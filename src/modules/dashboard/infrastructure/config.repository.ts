/**
 * Config & Cierre Repository.
 *
 * Wraps Prisma queries for configuration and daily close data.
 */

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
  async getBaseDia(todayKey: string): Promise<number> {
    const [todayConfig, globalConfig] = await Promise.all([
      prisma.config.findUnique({ where: { clave: todayKey } }),
      prisma.config.findUnique({ where: { clave: 'BASE_DIA' } }),
    ])

    const raw = todayConfig
      ? parseFloat(todayConfig.valor)
      : globalConfig
        ? parseFloat(globalConfig.valor)
        : 0

    return isNaN(raw) ? 0 : raw
  }

  async getStockConfigs(): Promise<Record<string, string>> {
    const configs = await prisma.config.findMany({
      where: { clave: { in: ['STOCK_INI_AGUA', 'STOCK_INI_HIELO', 'STOCK_INI_BOTELLON'] } },
    })
    return Object.fromEntries(configs.map(c => [c.clave, c.valor]))
  }

  async getLastCierre(): Promise<CierreData | null> {
    const cierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
      select: { stockFinAgua: true, stockFinHielo: true },
    })
    return cierre ?? null
  }
}
