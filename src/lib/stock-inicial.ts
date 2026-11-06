import type { Prisma } from '@prisma/client'
import { startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'
import { determinarStockInicial } from '@/modules/dashboard/domain/stock.service'

export interface StockInicial {
  stockIniAgua: number
  stockIniHielo: number
  /** #618: botellones llenos al empezar el día. */
  stockIniBotellon: number
}

/**
 * #545: única regla del stock inicial para dashboard, /produccion y /cierre.
 * Con cierre previo, manda su stock final. Sin cierre previo (empalme),
 * se usan Config STOCK_INI_AGUA / STOCK_INI_HIELO. Botellones (#618): igual con STOCK_INI_BOTELLON.
 */
export async function resolverStockInicial(
  db: Pick<Prisma.TransactionClient, 'config' | 'cierreDia'>,
  /** #645: para un día atrasado, el último cierre ANTERIOR a ese día (inicio del día comercial). */
  antesDe: Date = startOfDayInBogota(todayInBogota()),
): Promise<StockInicial> {
  const [ultimoCierre, configRows] = await Promise.all([
    db.cierreDia.findFirst({
      where: { fecha: { lt: antesDe } },
      orderBy: { fecha: 'desc' },
      select: { stockFinAgua: true, stockFinHielo: true, stockFinBotellon: true },
    }),
    db.config.findMany({
      where: { clave: { in: ['STOCK_INI_AGUA', 'STOCK_INI_HIELO', 'STOCK_INI_BOTELLON'] } },
    }),
  ])
  const configs = Object.fromEntries(configRows.map((c) => [c.clave, c.valor]))
  const base = determinarStockInicial(
    ultimoCierre?.stockFinAgua ?? null,
    ultimoCierre?.stockFinHielo ?? null,
    ultimoCierre !== null,
    configs,
  )
  // #618: un cierre anterior a registrar botellones (stockFinBotellon NULL) no trae su conteo: se usa Config, como
  // agua y hielo cuando no hay cierre previo.
  const stockIniBotellon = ultimoCierre?.stockFinBotellon ?? (parseInt(configs.STOCK_INI_BOTELLON) || 0)
  return { ...base, stockIniBotellon }
}
