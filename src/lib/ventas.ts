import { prisma } from './prisma'
import { getTodayRange, getDateRange } from './dates'

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

  const pedidos = await prisma.pedido.findMany({
    where: {
      fecha: { gte: start, lt: end },
      estado: 'ENTREGADO',
    },
    select: {
      cPacaAguaEnt: true,
      cPacaHieloEnt: true,
      cBotellonFabEnt: true,
      cBotellonDomEnt: true,
      cBolsaAguaEnt: true,
      cBolsaHieloEnt: true,
    },
  })

  return {
    aguaVendida: pedidos.reduce((sum, p) => sum + p.cPacaAguaEnt, 0),
    hieloVendido: pedidos.reduce((sum, p) => sum + p.cPacaHieloEnt, 0),
    botellonVendido: pedidos.reduce((sum, p) => sum + (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0), 0),
    bolsaAguaVendida: pedidos.reduce((sum, p) => sum + p.cBolsaAguaEnt, 0),
    bolsaHieloVendida: pedidos.reduce((sum, p) => sum + p.cBolsaHieloEnt, 0),
  }
}
