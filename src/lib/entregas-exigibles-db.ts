import { exigiblesActivos } from './exigibles-flag'
// Hechos inmutables; el pago se proyecta al leer, nunca se sincroniza en una segunda contabilidad.
import type { Prisma } from '@prisma/client'
import { calcularExigibleVigente } from './entregas-exigibles'
export interface LineaEntregada { producto: string; cantidad: number; precioCents: number }
export async function registrarEntregaExigible(tx: Prisma.TransactionClient, input: {
  pedidoId: string; entregadoAt: Date; lineas: LineaEntregada[]; eventoId?: string; huella?: string
  pedido: { total: number; totalPagado: number; saldo: number }
}): Promise<void> {
  if (!exigiblesActivos()) return
  const lineas = input.lineas.filter(l => l.cantidad > 0)
  if (!lineas.length && !input.eventoId) return
  if (lineas.some(l => !Number.isSafeInteger(l.cantidad) || !Number.isSafeInteger(l.precioCents) || l.precioCents < 0))
    throw new Error('ENTREGA_EXIGIBLE_INVALIDA')
  const valorCents = lineas.reduce((sum, l) => sum + l.cantidad * l.precioCents, 0)
  await tx.entregaExigible.create({ data: { pedidoId: input.pedidoId, entregadoAt: input.entregadoAt,
    valorEntregado: valorCents / 100, lineas: lineas.map(l => ({ ...l })),
    eventoId: input.eventoId, huella: input.huella } })
}

/** Una lectura en lote, sin truncar antes de filtrar ni cambiar el saldo contractual. */
export async function leerExigibles(db: Pick<Prisma.TransactionClient, 'pedido'>, where: Prisma.PedidoWhereInput = {}) {
  if (!exigiblesActivos()) {
    const pedidos = await db.pedido.findMany({ where, select: { id: true, estadoEntrega: true, saldo: true } })
    return new Map(pedidos.map(p => [p.id, p.estadoEntrega === 'ENTREGADO' ? Math.max(0, Number(p.saldo)) : 0]))
  }
  const pedidos = await db.pedido.findMany({ where, select: {
    id: true, total: true, totalPagado: true, saldo: true, estadoEntrega: true,
    items: { orderBy: { id: 'asc' }, select: { producto: true, cantEntrega: true, precio: true } },
    entregasExigibles: { select: { valorEntregado: true, lineas: true } },
  } })
  return new Map(pedidos.map(p => [p.id, calcularExigibleVigente(p)]))
}
