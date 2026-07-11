import { Trabajador } from '@prisma/client'

export interface ComisionResult {
  comAgua: number
  comHielo: number
  total: number
}

export function calcComSellador(
  prodAgua: number,
  prodHielo: number,
  trabajador: Pick<Trabajador, 'comPacaAgua' | 'comPacaHielo'>,
): ComisionResult {
  const comAgua = prodAgua * Number(trabajador.comPacaAgua)
  const comHielo = prodHielo * Number(trabajador.comPacaHielo)
  return { comAgua, comHielo, total: comAgua + comHielo }
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
