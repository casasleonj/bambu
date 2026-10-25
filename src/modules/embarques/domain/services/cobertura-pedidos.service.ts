/**
 * Cobertura exacta de pedidos en el cierre (ADR-CIERRE-002 §1-2, hallazgos
 * #444, #448, #449).
 *
 * Lógica pura (sin Prisma): decide si el `pedidos[]` que llegó al cierre cubre
 * EXACTAMENTE los pedidos vigentes del embarque.
 *
 * - Un pedido `CANCELADO` o `ANULADO` no es entregable: si llega en el payload se
 *   rechaza (`PEDIDO_NO_ENTREGABLE`) y, si sigue asignado al embarque, NO cuenta
 *   como pendiente (no hay nada que resolver con él).
 * - Un pedido vigente que no viene en el payload bloquea el cierre
 *   (`PEDIDOS_SIN_RESOLVER`): antes quedaba EN_RUTA dentro de un embarque CERRADO.
 * - Un pedido que no pertenece al embarque se rechaza (`PEDIDO_FUERA_DEL_EMBARQUE`).
 * - Un pedido repetido se rechaza (`PEDIDO_DUPLICADO`): evita la doble entrega.
 *
 * Cada violación lanza un `Error` cuyo mensaje empieza por el código; la ruta lo
 * traduce a 409 con el texto para el usuario.
 */

export interface PedidoDelEmbarque {
  id: string
  numero: number
  estadoEntrega: string
  estado: string
}

const NO_ENTREGABLES = new Set(['CANCELADO', 'ANULADO'])

export function esPedidoEntregable(p: Pick<PedidoDelEmbarque, 'estadoEntrega' | 'estado'>): boolean {
  return !NO_ENTREGABLES.has(p.estadoEntrega) && !NO_ENTREGABLES.has(p.estado)
}

const etiqueta = (p: { id: string; numero?: number }) => (p.numero !== undefined ? `#${p.numero} (${p.id})` : p.id)

export function validarCoberturaPedidos(
  pedidosDelEmbarque: PedidoDelEmbarque[],
  pedidoIdsDelPayload: string[],
): void {
  const porId = new Map(pedidosDelEmbarque.map((p) => [p.id, p]))

  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const id of pedidoIdsDelPayload) {
    if (vistos.has(id)) repetidos.add(id)
    vistos.add(id)
  }
  if (repetidos.size > 0) {
    throw new Error(
      `PEDIDO_DUPLICADO: el pedido ${[...repetidos].map((id) => etiqueta(porId.get(id) ?? { id })).join(', ')} viene más de una vez en el cierre.`,
    )
  }

  const ajenos = pedidoIdsDelPayload.filter((id) => !porId.has(id))
  if (ajenos.length > 0) {
    throw new Error(
      `PEDIDO_FUERA_DEL_EMBARQUE: ${ajenos.join(', ')} no pertenece a este embarque. Actualiza la pantalla: pudo salir del embarque mientras cerrabas.`,
    )
  }

  const noEntregables = pedidoIdsDelPayload
    .map((id) => porId.get(id))
    .filter((p): p is PedidoDelEmbarque => Boolean(p) && !esPedidoEntregable(p as PedidoDelEmbarque))
  if (noEntregables.length > 0) {
    throw new Error(
      `PEDIDO_NO_ENTREGABLE: ${noEntregables.map(etiqueta).join(', ')} está cancelado o anulado y no se puede registrar como entregado.`,
    )
  }

  const faltantes = pedidosDelEmbarque.filter((p) => esPedidoEntregable(p) && !vistos.has(p.id))
  if (faltantes.length > 0) {
    throw new Error(
      `PEDIDOS_SIN_RESOLVER: faltan por resolver ${faltantes.map(etiqueta).join(', ')}. Registra qué pasó con cada pedido antes de cerrar.`,
    )
  }
}
