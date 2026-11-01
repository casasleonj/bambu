import type { Prisma } from '@prisma/client'
import { determinarStockInicial } from '@/modules/dashboard/domain/stock.service'

export interface StockInicial {
  stockIniAgua: number
  stockIniHielo: number
}

/**
 * #545: única regla del stock inicial para dashboard, /produccion y /cierre.
 * Con cierre previo, manda su stock final. Sin cierre previo (empalme),
 * se usan Config STOCK_INI_AGUA / STOCK_INI_HIELO.
 */
export async function resolverStockInicial(
  db: Pick<Prisma.TransactionClient, 'config' | 'cierreDia'>,
): Promise<StockInicial> {
  const [ultimoCierre, configRows] = await Promise.all([
    db.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
      select: { stockFinAgua: true, stockFinHielo: true },
    }),
    db.config.findMany({
      where: { clave: { in: ['STOCK_INI_AGUA', 'STOCK_INI_HIELO'] } },
    }),
  ])
  const configs = Object.fromEntries(configRows.map((c) => [c.clave, c.valor]))
  return determinarStockInicial(
    ultimoCierre?.stockFinAgua ?? null,
    ultimoCierre?.stockFinHielo ?? null,
    ultimoCierre !== null,
    configs,
  )
}
