/**
 * #921 — política pura de presentación para pedidos SIN agrupar.
 * No modifica cobros, fechas, inventario ni la ruta geográfica.
 */
import { clasificarFranja, type PedidoConHora } from './pedidos-franja'

export interface PedidoPrioridad extends PedidoConHora {
  id: string
  createdAt: Date
  total: number
  totalPagado: number
  saldo: number
  confirmado: number
  items: ReadonlyArray<{ cantPedido: number; cantEntrega: number; cantRegaloPedido: number; cantRegaloEntrega: number }>
}

/** Datos monetarios únicamente de pagos ya consolidados en el pedido; nunca contar pagos pendientes de confirmación. */
export function ordenarPrioridadPedidos<T extends PedidoPrioridad>(pedidos: readonly T[], ahora: Date): T[] {
  const nivel = (p: T): number => {
    const cerrado = ['ANULADO', 'CANCELADO'].includes(p.estadoEntrega)
    const restante = p.items.some(i => i.cantPedido > i.cantEntrega || i.cantRegaloPedido > i.cantRegaloEntrega)
    if (cerrado) return 6
    if (!restante || p.estadoEntrega === 'ENTREGADO') return p.saldo > 0 ? 4 : 5
    // La promesa de hoy próxima o vencida tiene precedencia sobre pagos.
    if (clasificarFranja(p, ahora).franja === 'ya_toca') return 0
    // Programado para otro día: no adelantar por pago.
    if (p.fechaEntrega && new Date(p.fechaEntrega).getTime() > ahora.getTime() &&
        clasificarFranja(p, ahora).minutosFaltantes === null) return 3.5
    if (p.total > 0 && p.saldo <= 0 && p.confirmado >= p.total) return 1
    if (p.confirmado > 0 && p.saldo > 0) return 2
    return 3
  }
  return [...pedidos].sort((a, b) => nivel(a) - nivel(b) ||
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
}
