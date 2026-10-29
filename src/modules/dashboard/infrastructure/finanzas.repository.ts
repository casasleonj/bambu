import { Prisma } from '@prisma/client'
import { prisma } from '@/shared/infrastructure'
import { leerCobrosPeriodo, type CobrosPeriodo } from '@/lib/cobros-periodo'
import type { PedidoRaw } from '../domain'
import { PrismaPedidoRepository } from './pedido.repository'
import { PrismaConfigRepository } from './config.repository'
import { PrismaGastosRepository } from './operaciones.repository'

type Rango = { start: Date; end: Date }
export interface FinanzasDashboard {
  pedidosHoy: PedidoRaw[]
  pedidosAyer: PedidoRaw[]
  baseDia: number
  totalGastos: number
  fiadosTotal: number
  clientesConFiado: number
  cobros: CobrosPeriodo | null
  consultadoAt: string | null
}
export interface FinanzasRepository {
  leer(hoy: Rango, ayer: Rango): Promise<FinanzasDashboard>
}

/** Una misma fotografía para ventas, saldo y cobros. Sin escrituras ni llamadas externas. */
export class PrismaFinanzasRepository implements FinanzasRepository {
  async leer(hoy: Rango, ayer: Rango): Promise<FinanzasDashboard> {
    return prisma.$transaction(
      async (tx) => {
        const [instante] = await tx.$queryRaw<
          Array<{ instante: Date }>
        >`SELECT transaction_timestamp() AS instante`
        const pedidos = new PrismaPedidoRepository(tx)
        const config = new PrismaConfigRepository(tx)
        const gastos = new PrismaGastosRepository(tx)
        const dia = hoy.start.toLocaleDateString('en-CA', {
          timeZone: 'America/Bogota',
        })
        const [
          pedidosHoy,
          pedidosAyer,
          baseDia,
          totalGastos,
          fiadosTotal,
          clientesConFiado,
          cobros,
        ] = await Promise.all([
          pedidos.findByDateRange(hoy.start, hoy.end),
          pedidos.findByDateRange(ayer.start, ayer.end),
          config.getBaseDia(`BASE_DIA_${dia}`),
          gastos.sumByDateRange(hoy.start, hoy.end),
          pedidos.sumFiadosEntregados(),
          tx.cliente.count({
            where: {
              activo: true,
              pedidos: {
                some: { saldo: { gt: 0 }, estadoEntrega: 'ENTREGADO' },
              },
            },
          }),
          leerCobrosPeriodo(tx, hoy.start, hoy.end),
        ])
        return {
          pedidosHoy,
          pedidosAyer,
          baseDia,
          totalGastos,
          fiadosTotal,
          clientesConFiado,
          cobros,
          consultadoAt: instante.instante.toISOString(),
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5000,
        timeout: 15000,
      },
    )
  }
}
