import { importeLineaCentavos } from '@/shared/domain/unit-price'
/** Valor comercial del cumplimiento actual. No representa cobros ni cambia el pedido. */
export interface PedidoParaValorEntregado {
  total: unknown
  estadoEntrega: string
  items?: ReadonlyArray<{ cantEntrega: number; precio: unknown }> | null
}

export function valorEntregadoPedidoCentavos(p: PedidoParaValorEntregado): number {
  if (p.estadoEntrega === 'ANULADO' || p.estadoEntrega === 'CANCELADO') return 0
  if (p.estadoEntrega === 'ENTREGADO') return Math.round(Number(p.total) * 100)
  return (p.items ?? []).reduce((total, i) => total + importeLineaCentavos(i.precio, i.cantEntrega), 0)
}

/** Una proyección de lectura: el saldo contractual nunca se reescribe para mostrar la deuda entregada. */
export function importesEntregaPedido(p: PedidoParaValorEntregado & {
  saldo: unknown; totalPagado: unknown; exigible?: number
}) {
  const total = Number(p.total), pagado = Number(p.totalPagado)
  const entregado = valorEntregadoPedidoCentavos(p) / 100
  const terminal = ['ANULADO', 'CANCELADO'].includes(p.estadoEntrega)
  const parcial = !terminal && p.estadoEntrega !== 'ENTREGADO' && entregado > 0
  const porCobrar = p.exigible ?? (terminal ? 0 : p.estadoEntrega === 'ENTREGADO' ? Number(p.saldo) : null)
  return { total, pagado, entregado, parcial,
    pendienteEntrega: terminal ? 0 : Math.max(0, Math.round((total - entregado) * 100)) / 100,
    porCobrar,
    porConciliar: parcial && entregado > pagado && Number(p.saldo) > 0 && (porCobrar === null || porCobrar === 0),
  }
}
