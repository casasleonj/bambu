import { prisma } from './prisma'
import { getTodayRange, getDateRange } from './dates'

export interface VentasDelDia {
  aguaVendida: number
  hieloVendido: number
}

export async function getVentasDelDia(fecha?: Date): Promise<VentasDelDia> {
  const range = fecha
    ? getDateRange(fecha.toISOString().slice(0, 10), fecha.toISOString().slice(0, 10))
    : getTodayRange()

  const start = 'startDate' in range ? range.startDate : range.startOfDay
  const end = 'endDate' in range ? range.endDate : range.endOfDay

  const pedidos = await prisma.pedido.findMany({
    where: {
      fecha: { gte: start, lt: end },
      estado: 'ENTREGADO',
    },
    select: {
      cPacaAguaEnt: true,
      cPacaHieloEnt: true,
    },
  })

  return {
    aguaVendida: pedidos.reduce((sum, p) => sum + p.cPacaAguaEnt, 0),
    hieloVendido: pedidos.reduce((sum, p) => sum + p.cPacaHieloEnt, 0),
  }
}
