import { prisma } from '@/lib/prisma'

export interface EntregasHoy {
  /** Pedidos cuya entrega quedó registrada en el día (cerrados como ENTREGADO). */
  total: number
  /** De esos, los creados el mismo día. */
  deHoy: number
  /** De esos, los creados en días anteriores. */
  deDiasAnteriores: number
}

/**
 * Cuenta los pedidos entregados en el rango (día Bogotá, fin exclusivo).
 * El día de la entrega es `entregadoAt`; si el pedido no lo tiene (cierre de
 * embarque no lo escribía, #602) se usa la fecha del pedido. Anulados y
 * cancelados no cuentan. Solo lectura.
 */
export async function contarEntregasDelDia(rango: {
  start: Date
  end: Date
}): Promise<EntregasHoy> {
  const enRango = { gte: rango.start, lt: rango.end }
  const pedidos = await prisma.pedido.findMany({
    where: {
      estadoEntrega: 'ENTREGADO',
      OR: [{ entregadoAt: enRango }, { entregadoAt: null, fecha: enRango }],
    },
    select: { fecha: true },
  })
  const deHoy = pedidos.filter(
    (p) => p.fecha >= rango.start && p.fecha < rango.end,
  ).length
  return {
    total: pedidos.length,
    deHoy,
    deDiasAnteriores: pedidos.length - deHoy,
  }
}
