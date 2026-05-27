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

export interface StockEstimado {
  agua: number
  hielo: number
  fecha: string
}

export async function getStockEstimadoHoy(): Promise<StockEstimado | null> {
  const config = await prisma.config.findUnique({
    where: { clave: 'stock_estimado_hoy' },
  })
  if (!config) return null

  try {
    const data = JSON.parse(config.valor) as StockEstimado
    const today = new Date().toISOString().split('T')[0]
    if (data.fecha !== today) return null
    return data
  } catch {
    return null
  }
}

export async function setStockEstimadoHoy(agua: number, hielo: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  await prisma.config.upsert({
    where: { clave: 'stock_estimado_hoy' },
    update: { valor: JSON.stringify({ agua, hielo, fecha: today }) },
    create: { clave: 'stock_estimado_hoy', valor: JSON.stringify({ agua, hielo, fecha: today }) },
  })
}

export async function clearStockEstimadoHoy(): Promise<void> {
  await prisma.config.deleteMany({
    where: { clave: 'stock_estimado_hoy' },
  })
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

export interface StockDisponibleResult {
  stock: StockSnapshot
  tieneEstimado: boolean
}

export async function getStockDisponible(): Promise<StockDisponibleResult> {
  const { startOfDay, endOfDay } = getTodayRange()

  const ultimoCierre = await prisma.cierreDia.findFirst({
    orderBy: { fecha: 'desc' },
  })

  const stockEstimado = await getStockEstimadoHoy()

  const stockBase: StockSnapshot = {
    PACA_AGUA: Math.max(ultimoCierre?.stockFinAgua || 0, stockEstimado?.agua || 0),
    PACA_HIELO: Math.max(ultimoCierre?.stockFinHielo || 0, stockEstimado?.hielo || 0),
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

  return {
    stock: stockBase,
    tieneEstimado: stockEstimado !== null,
  }
}

export async function validarStock(carga: StockSnapshot): Promise<{ ok: boolean; faltante?: StockSnapshot }> {
  const stockResult = await getStockDisponible()
  const disponible = stockResult.stock
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
  const stockResult = await getStockDisponible()
  const disponible = stockResult.stock
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
