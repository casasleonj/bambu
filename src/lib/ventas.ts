import { prisma } from './prisma'
import { getTodayRange, getDateRange } from './dates'
import { unidadesEntregadasDelDia } from './unidades-entregadas-dia'

export interface VentasDelDia {
  aguaVendida: number
  hieloVendido: number
  botellonVendido: number
  bolsaAguaVendida: number
  bolsaHieloVendida: number
}

export async function getVentasDelDia(fecha?: Date): Promise<VentasDelDia> {
  const range = fecha
    ? getDateRange(fecha.toISOString().slice(0, 10), fecha.toISOString().slice(0, 10))
    : getTodayRange()

  const start = 'startDate' in range ? range.startDate : range.startOfDay
  const end = 'endDate' in range ? range.endDate : range.endOfDay

  // #650 (2b): lo vendido es lo entregado ESE día (misma función que el cierre y el dashboard).
  const u = await unidadesEntregadasDelDia(prisma, { desde: start, hasta: end })
  return {
    aguaVendida: u.agua,
    hieloVendido: u.hielo,
    botellonVendido: u.botellon,
    bolsaAguaVendida: u.bolsaAgua,
    bolsaHieloVendida: u.bolsaHielo,
  }
}
