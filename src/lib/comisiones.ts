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
  repartidores: Array<Pick<Trabajador, 'comPacaAgua' | 'comPacaHielo'>>,
): ComisionResult {
  if (repartidores.length === 0) {
    return { comAgua: 0, comHielo: 0, total: 0 }
  }
  const avgComAgua =
    repartidores.reduce((s, r) => s + Number(r.comPacaAgua), 0) / repartidores.length
  const avgComHielo =
    repartidores.reduce((s, r) => s + Number(r.comPacaHielo), 0) / repartidores.length

  const comAgua = ventasAgua * avgComAgua
  const comHielo = ventasHielo * avgComHielo
  return { comAgua, comHielo, total: comAgua + comHielo }
}
