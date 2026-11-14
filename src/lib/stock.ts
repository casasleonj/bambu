import { prisma } from './prisma'
import { getTodayRange, getTodayString } from './dates'
import { EstadoEmbarque } from '@prisma/client'
import { netoPrevioDelDia } from './produccion-previas'

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
  botellon: number
  fecha: string
}

export async function getStockEstimadoHoy(): Promise<StockEstimado | null> {
  const config = await prisma.config.findUnique({
    where: { clave: 'stock_estimado_hoy' },
  })
  if (!config) return null

  try {
    const data = JSON.parse(config.valor) as StockEstimado
    const today = getTodayString()
    if (data.fecha !== today) return null
    return data
  } catch {
    return null
  }
}

export async function setStockEstimadoHoy(agua: number, hielo: number, botellon: number): Promise<void> {
  // Bogotá, NO UTC: `getStockEstimadoHoy` compara contra `getTodayString()`
  // (America/Bogota). Con `new Date().toISOString()` (UTC) el registro se
  // guardaba con fecha = mañana entre las 19:00 y 23:59 Bogotá, y el GET lo
  // descartaba por fecha != hoy → devolvía null toda la noche (AGENTS.md #17).
  const today = getTodayString()
  await prisma.config.upsert({
    where: { clave: 'stock_estimado_hoy' },
    update: { valor: JSON.stringify({ agua, hielo, botellon, fecha: today }) },
    create: { clave: 'stock_estimado_hoy', valor: JSON.stringify({ agua, hielo, botellon, fecha: today }) },
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

  // Paralelizar: cierre + stock estimado corren junto con producción + embarques.
  // Antes: 5 queries secuenciales, cada una esperaba a la anterior.
  // Ahora: 
  //   - Promise.all(lote1): cierreDia + stockEstimado (2 queries rápidas)
  //   - Promise.all(lote2): produccion + embarques de hoy (3 queries, las pesadas)
  // Los dos lotes corren en paralelo porque no comparten datos intermedios.
  const [loteConfig, loteProduccion] = await Promise.all([
    Promise.all([
      // #668: solo cierres ANTERIORES a hoy. El cierre de hoy ya incluye la producción y los embarques de hoy que se suman
      // abajo: tomarlo como base los contaría dos veces.
      prisma.cierreDia.findFirst({
        where: { fecha: { lt: startOfDay } },
        orderBy: { fecha: 'desc' },
      }),
      getStockEstimadoHoy(),
    ]),
    Promise.all([
      // Producción del día: sumar producido por producto
      prisma.produccionItem.findMany({
        where: {
          produccion: { fecha: { gte: startOfDay, lt: endOfDay } },
        },
        // #668: con las pérdidas, para descontarlas una sola vez (misma regla que las producciones previas de #645).
        select: { producto: true, producido: true, rotas: true, filtradas: true, consumoInterno: true },
      }),
      // Embarques del día: abiertos, en ruta y cerrados en UNA sola query.
      // Antes eran dos queries separadas (abiertos + cerrados), ahora se filtran
      // en aplicación. Esto reduce de 2 round-trips a 1.
      prisma.embarque.findMany({
        where: {
          fecha: { gte: startOfDay, lt: endOfDay },
          estado: { in: [EstadoEmbarque.ABIERTO, EstadoEmbarque.EN_RUTA, EstadoEmbarque.CERRADO] },
        },
        include: { productos: true },
      }),
    ]),
  ])

  const [ultimoCierre, stockEstimado] = loteConfig
  const [produccionesHoy, embarquesHoy] = loteProduccion

  const stockBase: StockSnapshot = {
    PACA_AGUA: Math.max(ultimoCierre?.stockFinAgua || 0, stockEstimado?.agua || 0),
    PACA_HIELO: Math.max(ultimoCierre?.stockFinHielo || 0, stockEstimado?.hielo || 0),
    BOTELLON: stockEstimado?.botellon || 0,
    BOLSA_AGUA: 0,
    BOLSA_HIELO: 0,
  }

  // #668: producido menos filtradas, merma (rotas) y consumo interno; nada se descuenta dos veces.
  const produccionHoy = [{ items: produccionesHoy }]
  stockBase.PACA_AGUA += netoPrevioDelDia(produccionHoy, 'PACA_AGUA')
  stockBase.PACA_HIELO += netoPrevioDelDia(produccionHoy, 'PACA_HIELO')

  // Un solo loop. #668: la carga sale del almacén en cualquier estado; en un embarque cerrado vuelve solo lo devuelto
  // (500 iniciales − 100 cargadas + 20 devueltas = 420).
  for (const emb of embarquesHoy) {
    const esCerrado = emb.estado === EstadoEmbarque.CERRADO
    for (const prod of emb.productos) {
      const key = prod.producto as keyof StockSnapshot
      if (key in stockBase) {
        stockBase[key] -= prod.cargadas
        if (esCerrado) stockBase[key] += prod.devueltas
      }
    }
    // Fallback legacy (productos array vacío pero legacy pacasAgua/pacasHielo seteados)
    if (emb.productos.length === 0) {
      if (emb.pacasAgua > 0 || emb.devueltasAgua > 0) {
        // #668: misma regla que arriba — la carga sale siempre; en un cerrado vuelve lo devuelto.
        stockBase.PACA_AGUA -= emb.pacasAgua
        stockBase.PACA_HIELO -= emb.pacasHielo
        if (esCerrado) {
          stockBase.PACA_AGUA += emb.devueltasAgua
          stockBase.PACA_HIELO += emb.devueltasHielo
        }
      }
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

  for (const producto of PRODUCTOS_CON_STOCK) {
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
