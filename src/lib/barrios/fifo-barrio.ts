/**
 * #859 — orden FIFO de atención por barrio, independiente del recorrido.
 * Esta función no filtra elegibilidad: recibe únicamente pedidos con remanente
 * físico y exigibles, seleccionados por la capa de consulta.
 */
export interface PedidoBarrioFIFO {
  id: string;
  barrioClave: string;
  createdAt: Date;
}

export interface BarrioFIFO {
  clave: string;
  pedidoMasAntiguo: Date;
  pedidos: PedidoBarrioFIFO[];
}

const compararPedido = (a: PedidoBarrioFIFO, b: PedidoBarrioFIFO) =>
  a.createdAt.getTime() - b.createdAt.getTime() ||
  a.id.localeCompare(b.id);

export function ordenarBarriosFIFO(pedidos: readonly PedidoBarrioFIFO[]): BarrioFIFO[] {
  const porBarrio = new Map<string, PedidoBarrioFIFO[]>();
  for (const pedido of pedidos) {
    if (!Number.isFinite(pedido.createdAt.getTime())) {
      throw new Error('Fecha original de pedido inválida');
    }
    const grupo = porBarrio.get(pedido.barrioClave) ?? [];
    grupo.push(pedido);
    porBarrio.set(pedido.barrioClave, grupo);
  }
  return [...porBarrio.entries()]
    .map(([clave, items]) => {
      const ordenados = [...items].sort(compararPedido);
      return { clave, pedidoMasAntiguo: ordenados[0].createdAt, pedidos: ordenados };
    })
    .sort((a, b) =>
      a.pedidoMasAntiguo.getTime() - b.pedidoMasAntiguo.getTime() ||
      a.pedidos[0].id.localeCompare(b.pedidos[0].id) ||
      a.clave.localeCompare(b.clave)
    );
}
