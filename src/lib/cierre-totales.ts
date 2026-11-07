import { valorEntregadoPedidoCentavos, type PedidoParaValorEntregado } from './valor-entregado-pedido'
/** #511/#513: magnitudes compartidas por servidor e interfaz, en centavos. */
const centavos = (monto: number) => Math.round(monto * 100)

export function calcularNetoCierre(d: {
  baseDia: number; cobroVentasHoy: number; cobroCartera: number;
  totalGastos: number; comisiones: number; salarios: number;
}): number {
  return (centavos(d.baseDia) + centavos(d.cobroVentasHoy) + centavos(d.cobroCartera)
    - centavos(d.totalGastos) - centavos(d.comisiones) - centavos(d.salarios)) / 100
}

/**
 * #601: el efectivo que debe haber en la caja física al terminar el día. Solo cuenta billetes y
 * monedas: los pagos por Nequi, transferencia, Daviplata o bono NO están en la caja (por eso el
 * conteo del efectivo se compara contra este valor y no contra `calcularNetoCierre`).
 * Gastos y comisiones se restan completos (hoy se asume que salen de la caja); los salarios,
 * solo la parte pagada en efectivo (#305).
 */
export function calcularEfectivoEsperado(d: {
  baseDia: number; efectivoPagos: number; cobroCarteraEfectivo: number;
  totalGastos: number; comisiones: number; salariosEfectivo: number;
}): number {
  return (centavos(d.baseDia) + centavos(d.efectivoPagos) + centavos(d.cobroCarteraEfectivo)
    - centavos(d.totalGastos) - centavos(d.comisiones) - centavos(d.salariosEfectivo)) / 100
}

export function resumirVentasCierre(
  pedidos: ReadonlyArray<Omit<PedidoParaValorEntregado, 'estadoEntrega'> & { estadoEntrega?: string }>,
  notas: ReadonlyArray<{ monto: unknown; pedido: { fecha: Date } }>,
  inicio: Date,
) {
  // #656: el original comercial se conserva aparte. La venta no incluye lo que falta entregar.
  // La forma antigua sin estado solo se conserva para callers anteriores del helper puro.
  const valorComercialPedidosDelDia = pedidos.reduce((s, p) => s + centavos(Number(p.total)), 0) / 100
  const ventasDePedidosDelDia = pedidos.reduce((s, p) => s + (p.estadoEntrega === undefined
    ? centavos(Number(p.total)) : valorEntregadoPedidoCentavos({ ...p, estadoEntrega: p.estadoEntrega })), 0) / 100
  const totalNotasCredito = notas.reduce((s, n) => s + centavos(Number(n.monto)), 0) / 100
  const notasCreditoVentasAnteriores = notas.filter(n => n.pedido.fecha < inicio)
    .reduce((s, n) => s + centavos(Number(n.monto)), 0) / 100
  return {
    valorComercialPedidosDelDia, ventasDePedidosDelDia, totalNotasCredito, notasCreditoVentasAnteriores,
    notasCreditoSinAjusteVentas: (centavos(totalNotasCredito) - centavos(notasCreditoVentasAnteriores)) / 100,
    totalVentas: (centavos(ventasDePedidosDelDia) - centavos(notasCreditoVentasAnteriores)) / 100,
  }
}
