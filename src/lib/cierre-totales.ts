/** #511/#513: magnitudes compartidas por servidor e interfaz, en centavos. */
const centavos = (monto: number) => Math.round(monto * 100)

export function calcularNetoCierre(d: {
  baseDia: number; cobroVentasHoy: number; cobroCartera: number;
  totalGastos: number; comisiones: number; salarios: number;
}): number {
  return (centavos(d.baseDia) + centavos(d.cobroVentasHoy) + centavos(d.cobroCartera)
    - centavos(d.totalGastos) - centavos(d.comisiones) - centavos(d.salarios)) / 100
}

export function resumirVentasCierre(
  pedidos: ReadonlyArray<{ total: unknown }>,
  notas: ReadonlyArray<{ monto: unknown; pedido: { fecha: Date } }>,
  inicio: Date,
) {
  const ventasDePedidosDelDia = pedidos.reduce((s, p) => s + centavos(Number(p.total)), 0) / 100
  const totalNotasCredito = notas.reduce((s, n) => s + centavos(Number(n.monto)), 0) / 100
  const notasCreditoVentasAnteriores = notas.filter(n => n.pedido.fecha < inicio)
    .reduce((s, n) => s + centavos(Number(n.monto)), 0) / 100
  return {
    ventasDePedidosDelDia, totalNotasCredito, notasCreditoVentasAnteriores,
    notasCreditoSinAjusteVentas: (centavos(totalNotasCredito) - centavos(notasCreditoVentasAnteriores)) / 100,
    totalVentas: (centavos(ventasDePedidosDelDia) - centavos(notasCreditoVentasAnteriores)) / 100,
  }
}
