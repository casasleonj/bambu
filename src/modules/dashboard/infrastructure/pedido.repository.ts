import { leerExigibles } from '@/lib/entregas-exigibles-db'
/**
 * Pedido Repository.
 *
 * Wraps Prisma queries for the Pedido aggregate.
 * Returns domain types, not Prisma models.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/shared/infrastructure'
import type { PedidoRaw } from '../domain'

export interface PedidoRepository {
  findByDateRange(start: Date, end: Date): Promise<PedidoRaw[]>
  countDisputasAbiertas(): Promise<number>
  countPromesasProximasVencer(): Promise<number>
  sumFiadosEntregados(): Promise<number>
}

export class PrismaPedidoRepository implements PedidoRepository {
  constructor(
    private readonly db: Pick<Prisma.TransactionClient, 'pedido'> = prisma,
  ) {}
  async findByDateRange(start: Date, end: Date): Promise<PedidoRaw[]> {
    const pedidos = await this.db.pedido.findMany({
      where: { fecha: { gte: start, lt: end } },
      include: { items: true },
    })

    const exigibles = await leerExigibles(this.db, { id: { in: pedidos.map(p => p.id) } })
    return pedidos.map((p) => ({
      id: p.id,
      numero: p.numero,
      fecha: p.fecha,
      total: p.total,
      saldo: p.saldo,
      exigible: exigibles.get(p.id) ?? 0,
      estadoEntrega: p.estadoEntrega,
      estadoPago: p.estadoPago,
      canal: p.canal,
      cPacaAguaEnt: p.cPacaAguaEnt,
      cPacaHieloEnt: p.cPacaHieloEnt,
      cBotellonFabEnt: p.cBotellonFabEnt,
      cBotellonDomEnt: p.cBotellonDomEnt,
      items: p.items?.map((i) => ({
        producto: i.producto,
        cantEntrega: i.cantEntrega,
        precio: i.precio,
      })),
    }))
  }

  async countDisputasAbiertas(): Promise<number> {
    return this.db.pedido.count({ where: { disputaAbierta: true } })
  }

  async countPromesasProximasVencer(): Promise<number> {
    return this.db.pedido.count({
      where: {
        promesaPagoFecha: {
          gte: new Date(),
          lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
        estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] },
      },
    })
  }

  async sumFiadosEntregados(): Promise<number> {
    const exigibles = await leerExigibles(this.db, { saldo: { gt: 0 }, clienteId: { not: 'CONSUMIDOR_FINAL' } })
    return [...exigibles.values()].reduce((sum, n) => sum + Math.round(n * 100), 0) / 100
  }
}
