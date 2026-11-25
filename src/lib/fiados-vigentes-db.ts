import type { Prisma } from '@prisma/client'
import { leerExigibles } from './entregas-exigibles-db'
import { exigiblesActivos } from './exigibles-flag'
import { leerCierresOperativos } from './fiados-corte-operativo-db'
import { desglosarPedidoConFIFO } from './fiados-corte-operativo'
import { dayInBogota } from './date-helpers'

/** Lectura compartida; el llamador controla la transacción y el ámbito. */
export async function leerFiadosVigentes(tx: Pick<Prisma.TransactionClient, 'pedido' | 'cierreDia'>, where: Prisma.PedidoWhereInput, ahora = new Date()) {
      const [exigibles, titulares] = await Promise.all([
        leerExigibles(tx, where),
        tx.pedido.findMany({ where, select: { id: true, clienteId: true, total: true, totalPagado: true,
          estadoEntrega: true, entregadoAt: true,
          ...(exigiblesActivos() ? { entregasExigibles: { select: { id: true, entregadoAt: true, valorEntregado: true } } } : {}),
        } }),
      ])
      const conDeuda = titulares.filter(p => (exigibles.get(p.id) ?? 0) > 0)
      const entradas = conDeuda.map(p => ({
        p,
        entregas: 'entregasExigibles' in p && Array.isArray(p.entregasExigibles) && p.entregasExigibles.length
          ? p.entregasExigibles.map((e: { id: string; entregadoAt: Date; valorEntregado: unknown }) => ({
              id: e.id, entregadoAt: e.entregadoAt, valorEntregado: Number(e.valorEntregado),
            }))
          : p.estadoEntrega === 'ENTREGADO' && p.entregadoAt
            ? [{ id: p.id, entregadoAt: p.entregadoAt, valorEntregado: Number(p.total) }] : [],
      }))
      const cierresPorDia = await leerCierresOperativos(tx, entradas.flatMap(e => e.entregas.map(x => dayInBogota(x.entregadoAt))))
      const porPedido = new Map<string, { fiado: number; pendiente: number; sinClasificar: number; exigible: number }>()
      const clientesFiados = new Set<string>()
      let fiado = 0, pendiente = 0, sinClasificar = 0, pedidosPendientes = 0
      const clientesSinClasificar = new Set<string>()
      for (const { p, entregas } of entradas) {
        const exigible = exigibles.get(p.id) ?? 0
        const d = desglosarPedidoConFIFO({ entregas, exigible, totalPagado: Number(p.totalPagado), cierresPorDia }, ahora)
        if (!d) { clientesSinClasificar.add(p.clienteId); sinClasificar += Math.round(exigible * 100); porPedido.set(p.id, { fiado: 0, pendiente: 0, sinClasificar: exigible, exigible }); continue }
        porPedido.set(p.id, { fiado: d.fiadoCentavos / 100, pendiente: d.pendienteOperativoCentavos / 100, sinClasificar: 0, exigible })
        if (d.fiadoCentavos > 0) clientesFiados.add(p.clienteId)
        if (d.pendienteOperativoCentavos > 0) pedidosPendientes++
        fiado += d.fiadoCentavos
        pendiente += d.pendienteOperativoCentavos
      }
      return {
        porPedido,
        corteOperativo: { clientesFiados: clientesFiados.size, pedidosPendientes,
          clientesConsultaFiados: new Set([...clientesFiados, ...clientesSinClasificar]).size,
          fiado: fiado / 100, pendiente: pendiente / 100, sinClasificar: sinClasificar / 100 },
        clientes: new Set(conDeuda.map(p => p.clienteId)).size,
        pedidos: conDeuda.length,
        total: conDeuda.reduce((s, p) => s + Math.round((exigibles.get(p.id) ?? 0) * 100), 0) / 100,
      }
}
