/**
 * ¿Una edición pide cambiar líneas o solo reenvía lo mismo?
 *
 * Regla ÚNICA, compartida por el cliente (para decidir si envía `items`) y por
 * el servidor (para decidir si aplican las guardas de cantidades/N2 y si se
 * re-precifica). Si divergieran, el formulario podría enviar `items` que el
 * servidor trate como cambio (o al revés).
 *
 * Una línea solicitada NO cambia nada si pide la misma cantidad y (o no trae
 * precio manual, o repite el precio manual ya vigente de esa línea).
 */

export interface LineaPrevia {
  producto: string
  cantidad: number
  precio: number
  precioOrigen: string
}

export interface LineaSolicitadaPlana {
  producto: string
  cantidad: number
  precioManual?: number
}

export function lineaSinCambio(
  previo: Pick<LineaPrevia, 'cantidad' | 'precio' | 'precioOrigen'> | undefined,
  solicitada: Pick<LineaSolicitadaPlana, 'cantidad' | 'precioManual'>,
): boolean {
  if (!previo || previo.cantidad !== solicitada.cantidad) return false
  if (!solicitada.precioManual) return true
  return previo.precioOrigen === 'manual' && previo.precio === solicitada.precioManual
}

/** true si `solicitadas` (ignorando cantidad 0) difiere de `previas` en alguna línea. */
export function itemsCambiaron(previas: LineaPrevia[], solicitadas: LineaSolicitadaPlana[]): boolean {
  const activas = solicitadas.filter((l) => l.cantidad > 0)
  if (activas.length !== previas.length) return true
  const porProducto = new Map(previas.map((p) => [p.producto, p]))
  return activas.some((l) => !lineaSinCambio(porProducto.get(l.producto), l))
}
