/** #859: demanda física, nunca deuda monetaria. */
export interface LineaRemanente {
  producto: string;
  cantPedido: number;
  cantEntrega: number;
  cantRegaloPedido?: number;
  cantRegaloEntrega?: number;
}
export function remanentesPorProducto(lineas: readonly LineaRemanente[]): Record<string, number> {
  const resultado: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const linea of lineas) {
    const regaloPedido = linea.cantRegaloPedido ?? 0, regaloEntrega = linea.cantRegaloEntrega ?? 0;
    if (!Number.isSafeInteger(regaloPedido) || !Number.isSafeInteger(regaloEntrega) ||
        regaloPedido < 0 || regaloEntrega < 0 || !Number.isSafeInteger(linea.cantPedido) || !Number.isSafeInteger(linea.cantEntrega) ||
        linea.cantPedido < 0 || linea.cantEntrega < 0) {
      throw new Error("Cantidades físicas inválidas");
    }
    const restante = Math.max(0, linea.cantPedido - linea.cantEntrega) + Math.max(0, regaloPedido - regaloEntrega);
    if (restante > 0) resultado[linea.producto] = (resultado[linea.producto] ?? 0) + restante;
  }
  return resultado;
}
