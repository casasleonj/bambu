/**
 * Helpers puros de auto-generación de embarques.
 *
 * Extraídos de `POST /api/embarques/auto` para poder testearlos sin Postgres
 * (cierra A.10 #4 en su parte de lógica pura: el chunking por capacidad que
 * hoy solo se cubre vía E2E contra DB real).
 */

import { PESOS_KG } from '@/lib/embarque-capacidad'

export interface PedidoCantidades {
  cPacaAguaPed?: number | null
  cPacaHieloPed?: number | null
  cBotellonFabPed?: number | null
  cBotellonDomPed?: number | null
  cBolsaAguaPed?: number | null
  cBolsaHieloPed?: number | null
}

/** Unidades totales (pacas + botellones + bolsas) de un pedido. */
export function unidadesPedido(p: PedidoCantidades): number {
  return (
    (p.cPacaAguaPed || 0) +
    (p.cPacaHieloPed || 0) +
    (p.cBotellonFabPed || 0) +
    (p.cBotellonDomPed || 0) +
    (p.cBolsaAguaPed || 0) +
    (p.cBolsaHieloPed || 0)
  )
}

/** Peso en KG de un pedido según pesos reales por unidad. */
export function pesoPedido(p: PedidoCantidades): number {
  return (
    (p.cPacaAguaPed || 0) * PESOS_KG.PACA_AGUA +
    (p.cPacaHieloPed || 0) * PESOS_KG.PACA_HIELO +
    (p.cBotellonFabPed || 0) * PESOS_KG.BOTELLON +
    (p.cBotellonDomPed || 0) * PESOS_KG.BOTELLON +
    (p.cBolsaAguaPed || 0) * PESOS_KG.BOLSA_AGUA +
    (p.cBolsaHieloPed || 0) * PESOS_KG.BOLSA_HIELO
  )
}

/**
 * Greedy chunking: agrega pedidos al chunk actual hasta que sumar el siguiente
 * excedería `maxUnidades`. Un pedido individual mayor a `maxUnidades` va solo
 * en su propio chunk. Preserva el orden de entrada (los más antiguos primero).
 */
export function splitPedidosByCapacity<T extends PedidoCantidades>(
  pedidos: T[],
  maxUnidades: number,
): T[][] {
  const chunks: T[][] = []
  let chunkActual: T[] = []
  let unidadesChunk = 0

  for (const pedido of pedidos) {
    const unidades = unidadesPedido(pedido)
    if (unidades > maxUnidades) {
      if (chunkActual.length > 0) {
        chunks.push(chunkActual)
        chunkActual = []
        unidadesChunk = 0
      }
      chunks.push([pedido])
      continue
    }
    if (unidadesChunk + unidades > maxUnidades && chunkActual.length > 0) {
      chunks.push(chunkActual)
      chunkActual = []
      unidadesChunk = 0
    }
    chunkActual.push(pedido)
    unidadesChunk += unidades
  }
  if (chunkActual.length > 0) {
    chunks.push(chunkActual)
  }
  return chunks
}
