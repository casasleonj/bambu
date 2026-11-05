import { Trabajador } from '@prisma/client'

export interface ComisionResult {
  comAgua: number
  comHielo: number
  total: number
}

export interface ComisionSelladorResult extends ComisionResult {
  /** #645: comisión por botellones LLENADOS (se digitan; no son los vendidos). */
  comBotellon: number
}

export function calcComSellador(
  prodAgua: number,
  prodHielo: number,
  trabajador: Pick<Trabajador, 'comPacaAgua' | 'comPacaHielo'> & Partial<Pick<Trabajador, 'comBotellon'>>,
  botellonesLlenados = 0,
): ComisionSelladorResult {
  const comAgua = prodAgua * Number(trabajador.comPacaAgua)
  const comHielo = prodHielo * Number(trabajador.comPacaHielo)
  const comBotellon = botellonesLlenados * Number(trabajador.comBotellon ?? 0)
  return { comAgua, comHielo, comBotellon, total: comAgua + comHielo + comBotellon }
}

export function calcComRepartidor(
  ventasAgua: number,
  ventasHielo: number,
  repartidores: Array<Pick<Trabajador, 'comRepartAgua' | 'comRepartHielo' | 'usaMoto'>>,
): ComisionResult {
  const activos = repartidores.filter(r => r.usaMoto)
  if (activos.length === 0) {
    return { comAgua: 0, comHielo: 0, total: 0 }
  }
  const avgComAgua =
    activos.reduce((s, r) => s + Number(r.comRepartAgua), 0) / activos.length
  const avgComHielo =
    activos.reduce((s, r) => s + Number(r.comRepartHielo), 0) / activos.length

  const comAgua = ventasAgua * avgComAgua
  const comHielo = ventasHielo * avgComHielo
  return { comAgua, comHielo, total: comAgua + comHielo }
}

/**
 * Ítem de Producción para los botellones LLENADOS del día (#645). Llenados ≠ vendidos: se pueden llenar y quedar en
 * bodega, así que la comisión usa los llenados; `ventas` guarda los vendidos solo como referencia. Sin ciclo de stock.
 */
export function itemBotellon(llenados: number, comSellador: number, vendidos = 0) {
  return {
    producto: 'BOTELLON' as const,
    conteoA: llenados,
    conteoB: llenados,
    producido: llenados,
    stockIni: 0,
    ventas: vendidos,
    stockFinEsperado: 0,
    stockFinFisico: 0,
    diferencia: 0,
    filtradas: 0,
    rotas: 0,
    consumoInterno: 0,
    comSellador,
  }
}
