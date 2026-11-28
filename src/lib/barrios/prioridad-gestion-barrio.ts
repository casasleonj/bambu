/**
 * #859: prioridad de GESTIÓN DENTRO de cada barrio.
 * No decide el orden entre barrios (FIFO o Recorrido) ni modifica los pedidos.
 * Dentro de cada categoría conserva la antigüedad original.
 */
export interface PedidoGestionBarrio {
  estadoEntrega: string
  fechaEntrega?: Date | null
  saldo: number
  items: ReadonlyArray<{
    cantPedido: number
    cantEntrega: number
    cantRegaloPedido: number
    cantRegaloEntrega: number
  }>
}

/**
 * 0 = entrega exigible pendiente, incluido parcial
 * 1 = entrega pendiente programada para el futuro
 * 2 = entrega ya realizada, pero aún queda dinero por cobrar
 * 3 = entrega y cobro completados
 * 4 = anulado o cancelado (solo en consultas que los incluyen)
 */
export function nivelGestionBarrio(p: PedidoGestionBarrio, ahora: Date): number {
  if (p.estadoEntrega === 'ANULADO' || p.estadoEntrega === 'CANCELADO') return 4
  const faltanteFisico = p.estadoEntrega !== 'ENTREGADO' &&
    p.items.some(i => i.cantPedido > i.cantEntrega || i.cantRegaloPedido > i.cantRegaloEntrega)
  if (faltanteFisico) {
    if (p.fechaEntrega && p.fechaEntrega.getTime() > ahora.getTime()) return 1
    return 0
  }
  if (p.saldo > 0) return 2
  return 3
}
