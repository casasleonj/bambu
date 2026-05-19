import { prisma } from './prisma'

export interface VentasDelDia {
  aguaVendida: number
  hieloVendido: number
}

export async function getVentasDelDia(fecha?: Date): Promise<VentasDelDia> {
  const start = fecha ? new Date(fecha) : new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

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
