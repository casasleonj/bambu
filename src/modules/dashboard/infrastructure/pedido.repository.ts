/**
 * Pedido Repository.
 *
 * Wraps Prisma queries for the Pedido aggregate.
 * Returns domain types, not Prisma models.
 */

import { prisma } from '@/shared/infrastructure'
import type { PedidoRaw } from '../domain'

export interface PedidoRepository {
  findByDateRange(start: Date, end: Date): Promise<PedidoRaw[]>
  countDisputasAbiertas(): Promise<number>
  countPromesasProximasVencer(): Promise<number>
  sumFiadosEntregados(): Promise<number>
}

export class PrismaPedidoRepository implements PedidoRepository {
  async findByDateRange(start: Date, end: Date): Promise<PedidoRaw[]> {
    const pedidos = await prisma.pedido.findMany({
      where: { fecha: { gte: start, lt: end } },
      include: { items: true },
    })

    return pedidos.map(p => ({
      id: p.id,
      numero: p.numero,
      fecha: p.fecha,
      total: p.total,
      saldo: p.saldo,
      estadoEntrega: p.estadoEntrega,
      estadoPago: p.estadoPago,
      cPacaAguaEnt: p.cPacaAguaEnt,
      cPacaHieloEnt: p.cPacaHieloEnt,
      cBotellonFabEnt: p.cBotellonFabEnt,
      cBotellonDomEnt: p.cBotellonDomEnt,
      items: p.items?.map(i => ({
        producto: i.producto,
        cantEntrega: i.cantEntrega,
        precio: i.precio,
      })),
    }))
  }

  async countDisputasAbiertas(): Promise<number> {
    return prisma.pedido.count({ where: { disputaAbierta: true } })
  }

  async countPromesasProximasVencer(): Promise<number> {
    return prisma.pedido.count({
      where: {
        promesaPagoFecha: { gte: new Date(), lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
        estadoPago: { notIn: ['PAGADO', 'ANULADO'] },
      },
    })
  }

  async sumFiadosEntregados(): Promise<number> {
    const result = await prisma.pedido.aggregate({
      where: { saldo: { gt: 0 }, estadoEntrega: 'ENTREGADO' },
      _sum: { saldo: true },
    })
    return Number(result._sum.saldo) || 0
  }
}
