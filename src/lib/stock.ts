import { prisma } from './prisma'
import { getTodayRange } from './dates'
import { EstadoEmbarque } from '@prisma/client'

export interface StockSnapshot {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
}

export const PRODUCTOS_DOMICILIO = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const

export const PRODUCTOS_CON_STOCK = ['PACA_AGUA', 'PACA_HIELO'] as const

export const PRODUCTOS_SIN_STOCK_TRACKING = ['BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const

export function emptyStock(): StockSnapshot {
  return { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }
}

export function stockFromRecord(rec: Record<string, number>): StockSnapshot {
  return {
    PACA_AGUA: rec['PACA_AGUA'] || 0,
    PACA_HIELO: rec['PACA_HIELO'] || 0,
    BOTELLON: rec['BOTELLON'] || 0,
    BOLSA_AGUA: rec['BOLSA_AGUA'] || 0,
    BOLSA_HIELO: rec['BOLSA_HIELO'] || 0,
  }
}

export async function getStockDisponible(): Promise<StockSnapshot> {
  const { startOfDay, endOfDay } = getTodayRange()

  const ultimoCierre = await prisma.cierreDia.findFirst({
    orderBy: { fecha: 'desc' },
  })

  const stockBase: StockSnapshot = {
    PACA_AGUA: ultimoCierre?.stockFinAgua || 0,
    PACA_HIELO: ultimoCierre?.stockFinHielo || 0,
    BOTELLON: 0,
    BOLSA_AGUA: 0,
    BOLSA_HIELO: 0,
  }

  const produccionesHoy = await prisma.produccion.findMany({
    where: { fecha: { gte: startOfDay, lt: endOfDay } },
  })

  for (const prod of produccionesHoy) {
    stockBase.PACA_AGUA += prod.prodAgua
    stockBase.PACA_HIELO += prod.prodHielo
  }

  const embarquesAbiertos = await prisma.embarque.findMany({
    where: {
      fecha: { gte: startOfDay, lt: endOfDay },
      estado: { in: [EstadoEmbarque.ABIERTO, EstadoEmbarque.EN_RUTA] },
    },
    include: { productos: true },
  })

  for (const emb of embarquesAbiertos) {
    for (const prod of emb.productos) {
      const key = prod.producto as keyof StockSnapshot
      if (key in stockBase) {
        stockBase[key] -= prod.cargadas
      }
    }
    if (emb.pacasAgua > 0 && emb.productos.length === 0) {
      stockBase.PACA_AGUA -= emb.pacasAgua
      stockBase.PACA_HIELO -= emb.pacasHielo
    }
  }

  const embarquesCerradosHoy = await prisma.embarque.findMany({
    where: {
      fecha: { gte: startOfDay, lt: endOfDay },
      estado: EstadoEmbarque.CERRADO,
    },
    include: { productos: true },
  })

  for (const emb of embarquesCerradosHoy) {
    for (const prod of emb.productos) {
      const key = prod.producto as keyof StockSnapshot
      if (key in stockBase) {
        stockBase[key] += prod.devueltas
      }
    }
    if (emb.devueltasAgua > 0 && emb.productos.length === 0) {
      stockBase.PACA_AGUA += emb.devueltasAgua
      stockBase.PACA_HIELO += emb.devueltasHielo
    }
  }

  return stockBase
}

export async function validarStock(carga: StockSnapshot): Promise<{ ok: boolean; faltante?: StockSnapshot }> {
  const disponible = await getStockDisponible()
  const faltante: StockSnapshot = emptyStock()
  let hayFaltante = false

  for (const producto of PRODUCTOS_DOMICILIO) {
    const key = producto as keyof StockSnapshot
    if (carga[key] > disponible[key]) {
      faltante[key] = carga[key] - disponible[key]
      hayFaltante = true
    }
  }

  if (hayFaltante) {
    return { ok: false, faltante }
  }
  return { ok: true }
}

export interface StockEvaluation {
  ok: boolean
  deficit: StockSnapshot
  totalDeficit: number
  hasDeficit: boolean
  disponible: StockSnapshot
}

export async function evaluarStock(carga: StockSnapshot): Promise<StockEvaluation> {
  const disponible = await getStockDisponible()
  const deficit: StockSnapshot = emptyStock()
  let totalDeficit = 0

  for (const producto of PRODUCTOS_CON_STOCK) {
    const key = producto as keyof StockSnapshot
    if (carga[key] > disponible[key]) {
      deficit[key] = carga[key] - disponible[key]
      totalDeficit += deficit[key]
    }
  }

  return {
    ok: totalDeficit === 0,
    deficit,
    totalDeficit,
    hasDeficit: totalDeficit > 0,
    disponible,
  }
}
