import { prisma } from './prisma'
import { dayInBogota, startOfDayInBogota } from './date-helpers'
import { unidadesEntregadasDelDia } from './unidades-entregadas-dia'

export interface VentasDelDia {
  aguaVendida: number
  hieloVendido: number
  botellonVendido: number
  bolsaAguaVendida: number
  bolsaHieloVendida: number
}

export async function getVentasDelDia(fecha?: Date): Promise<VentasDelDia> {
  const start = startOfDayInBogota(dayInBogota(fecha ?? new Date()))
  // El lector de hechos usa [inicio, fin): incluye el último milisegundo de Bogotá.
  const end = new Date(+start + 86_400_000)

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
