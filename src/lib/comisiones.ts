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
 * Ítem de Producción para los botellones LLENADOS del día (#645) y su inventario de llenos (#618). Llenados ≠ vendidos:
 * se pueden llenar y quedar en bodega. La comisión usa los llenados. Inventario (solo llenos, sin pérdidas):
 * Inicial + Llenados − Vendidos = Esperado, contra el conteo final.
 */
export function itemBotellon(
  llenados: number,
  comSellador: number,
  vendidos = 0,
  stock?: { stockIni: number; stockFinFisico: number },
) {
  const stockIni = stock?.stockIni ?? 0
  const stockFinEsperado = stockIni + llenados - vendidos
  // Sin conteo (clientes anteriores a #618) no se inventa una diferencia: se asume que cuadra.
  const stockFinFisico = stock ? stock.stockFinFisico : stockFinEsperado
  return {
    producto: 'BOTELLON' as const,
    conteoA: llenados,
    conteoB: llenados,
    producido: llenados,
    stockIni,
    ventas: vendidos,
    stockFinEsperado,
    stockFinFisico,
    diferencia: stockFinEsperado - stockFinFisico,
    filtradas: 0,
    rotas: 0,
    consumoInterno: 0,
    comSellador,
  }
}
