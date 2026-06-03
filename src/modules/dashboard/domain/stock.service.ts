/**
 * Stock Domain Service.
 *
 * Pure business logic for stock calculations.
 * No Prisma, no side effects — just math.
 *
 * NOTA: Botellones son passthrough (sin ciclo de stock). No se trackean
 * aquí. Se cuentan como ventas en VendidosHoy.botellon, pero no afectan
 * el inventario.
 */

import type { ProduccionDiaria, StockSnapshot } from './types'

export interface StockInput {
  stockIniAgua: number
  stockIniHielo: number
  produccion: ProduccionDiaria
  aguaVendida: number
  hieloVendido: number
}

export function calcularStock(input: StockInput): StockSnapshot {
  return {
    agua: Math.max(0, input.stockIniAgua + input.produccion.aguaProducida - input.aguaVendida - input.produccion.perdidasAgua),
    hielo: Math.max(0, input.stockIniHielo + input.produccion.hieloProducido - input.hieloVendido - input.produccion.perdidasHielo),
  }
}

export function determinarStockInicial(
  stockFinAguaCierre: number | null,
  stockFinHieloCierre: number | null,
  tieneCierrePrevio: boolean,
  configs: Record<string, string>,
): { stockIniAgua: number; stockIniHielo: number } {
  if (tieneCierrePrevio) {
    return {
      stockIniAgua: stockFinAguaCierre ?? 0,
      stockIniHielo: stockFinHieloCierre ?? 0,
    }
  }

  // Fallback: use config values only when no previous close exists
  return {
    stockIniAgua: parseInt(configs.STOCK_INI_AGUA) || 0,
    stockIniHielo: parseInt(configs.STOCK_INI_HIELO) || 0,
  }
}
