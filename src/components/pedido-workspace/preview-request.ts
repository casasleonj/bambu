import type { DraftPedido } from './types'

/** ¿el draft tiene lo mínimo para pedir un preview? */
export function isPreviewable(draft: DraftPedido): boolean {
  return (!!draft.clienteId || !!draft.clienteNuevo) && draft.items.some((i) => i.cantidad > 0)
}

function toRequestBody(draft: DraftPedido, pedidoId?: string, borradorId?: string) {
  return {
    clienteId: draft.clienteId ?? undefined,
    clienteNuevo: draft.clienteId ? undefined : draft.clienteNuevo,
    negocioId: draft.negocioId ?? undefined,
    canal: draft.canal,
    origen: draft.origen,
    items: draft.items
      .filter((i) => i.cantidad > 0)
      .map((i) => ({ producto: i.producto, cantidad: i.cantidad, precioManual: i.precioManual })),
    // modo edición: el PUT es declarativo de items, los pagos no se re-envían.
    pagos: pedidoId ? undefined : (draft.pagos.length > 0 ? draft.pagos : undefined),
    entregado: draft.entregado,
    // snapshot de dirección del pedido → suficiencia de entrega (autoridad única).
    direccionEntrega: draft.canal === 'DOMICILIO' ? (draft.direccionEntrega || undefined) : undefined,
    barrioEntrega: draft.canal === 'DOMICILIO' ? (draft.barrioEntrega || undefined) : undefined,
    entregaLat: draft.canal === 'DOMICILIO' ? (draft.entregaLat ?? undefined) : undefined,
    entregaLng: draft.canal === 'DOMICILIO' ? (draft.entregaLng ?? undefined) : undefined,
    pedidoOrigenId: draft.pedidoOrigenId,
    ventaEnRuta: draft.ventaEnRuta ? true : undefined,
    excepcionId: draft.excepcionId,
    pedidoId,
    // #408: el reintento del MISMO borrador no es una venta repetida (solo al crear).
    borradorId: pedidoId ? undefined : borradorId,
  }
}

export function previewRequestKey(draft: DraftPedido, pedidoId?: string, borradorId?: string): string {
  return JSON.stringify(toRequestBody(draft, pedidoId, borradorId))
}
