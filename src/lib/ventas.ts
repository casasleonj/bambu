import { prisma } from './prisma'
import type { Prisma } from '@prisma/client'
import { dayInBogota, startOfDayInBogota } from './date-helpers'
import { unidadesEntregadasDelDia } from './unidades-entregadas-dia'

export interface VentasDelDia {
  aguaVendida: number
  hieloVendido: number
  botellonVendido: number
  bolsaAguaVendida: number
  bolsaHieloVendida: number
}

type FuenteEntregas = Pick<Prisma.TransactionClient, 'historial' | 'embarqueMovimiento' | 'pedido'>
/** El POST de Producción pasa su tx para no usar cifras leídas antes del lock del Cierre. */
export async function getVentasDelDia(fecha?: Date, db: FuenteEntregas = prisma): Promise<VentasDelDia> {
  const start = startOfDayInBogota(dayInBogota(fecha ?? new Date()))
  // El lector de hechos usa [inicio, fin): incluye el último milisegundo de Bogotá.
  const end = new Date(+start + 86_400_000)

  // #650 (2b): lo vendido es lo entregado ESE día (misma función que el cierre y el dashboard).
  const u = await unidadesEntregadasDelDia(db, { desde: start, hasta: end })
  return {
    aguaVendida: u.agua,
    hieloVendido: u.hielo,
    botellonVendido: u.botellon,
    bolsaAguaVendida: u.bolsaAgua,
    bolsaHieloVendida: u.bolsaHielo,
  }
}
