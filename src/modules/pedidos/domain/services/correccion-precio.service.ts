/**
 * Corrección de precio de una línea del pedido (ADR-MONETARIO-002 §1, ADR-CIERRE-004).
 *
 * Lógica pura (sin Prisma): decide si una corrección es válida, cuánto cambia la
 * obligación y quién puede aplicarla. La persistencia vive en los casos de uso.
 *
 * Reglas:
 * - Cada línea tiene un único precio: el cambio rige para TODA la cantidad pedida de la
 *   línea (`delta = (precioNuevo − precioAnterior) × cantPedido`).
 * - Si el nuevo total quedaría por debajo de lo ya pagado se RECHAZA
 *   (`PRECIO_GENERARIA_SOBREPAGO`): `chk_pedido_montopagado_le_total` y la regla
 *   `totalPagado = Σ Pago + Σ Abono` no permiten bajar el total sin reversar pagos.
 * - «Precio raro» (< $2.000 en pacas, < $7.500 en botellón): se marca y lo aplica solo un ADMIN.
 * - El ASISTENTE solicita; el ADMIN aplica.
 */

export const PRECIO_RARO_MINIMO: Readonly<Record<string, number>> = {
  PACA_AGUA: 2000,
  PACA_HIELO: 2000,
  BOTELLON: 7500,
}

const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100
const aCentavos = (n: number): number => Math.round((n + Number.EPSILON) * 100)
const deCentavos = (c: number): number => c / 100

export function esPrecioRaro(producto: string, precioNuevo: number): boolean {
  const minimo = PRECIO_RARO_MINIMO[producto]
  return minimo !== undefined && precioNuevo < minimo
}

export interface CorreccionInput {
  total: number
  totalPagado: number
  cantidad: number
  precioAnterior: number
  precioNuevo: number
}

export interface CorreccionResultado {
  delta: number
  totalNuevo: number
  saldoNuevo: number
  /** Lo pagado de más respecto del nuevo total (0 si no hay). Se traslada a saldo a favor. */
  excedente: number
  /** Lo que queda pagado en el pedido: `min(totalPagado, totalNuevo)`. */
  totalPagadoNuevo: number
}

export function calcularCorreccion(input: CorreccionInput): CorreccionResultado {
  const { total, totalPagado, cantidad, precioAnterior, precioNuevo } = input
  if (!Number.isFinite(precioNuevo) || precioNuevo <= 0) {
    throw new Error('PRECIO_INVALIDO: el precio nuevo debe ser un número mayor que 0.')
  }
  if (redondear(precioNuevo) === redondear(precioAnterior)) {
    throw new Error('PRECIO_SIN_CAMBIO: el precio nuevo es igual al actual.')
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new Error('LINEA_SIN_CANTIDAD: la línea no tiene cantidad pedida.')
  }
  const deltaC = (aCentavos(precioNuevo) - aCentavos(precioAnterior)) * cantidad
  const totalNuevoC = aCentavos(total) + deltaC
  const pagadoC = aCentavos(totalPagado)
  const excedenteC = Math.max(0, pagadoC - totalNuevoC)
  const pagadoNuevoC = pagadoC - excedenteC
  return {
    delta: deCentavos(deltaC),
    totalNuevo: deCentavos(totalNuevoC),
    saldoNuevo: deCentavos(totalNuevoC - pagadoNuevoC),
    excedente: deCentavos(excedenteC),
    totalPagadoNuevo: deCentavos(pagadoNuevoC),
  }
}

export type RolCorreccion = 'ADMIN' | 'ASISTENTE' | string

/** Quién puede registrar una corrección (ADMIN y ASISTENTE). */
export function puedeSolicitarCorreccion(rol: RolCorreccion): boolean {
  return rol === 'ADMIN' || rol === 'ASISTENTE'
}

/** Solo un ADMIN aplica; el ASISTENTE deja una solicitud pendiente. */
export function decidirAplicacion(rol: RolCorreccion): 'APLICAR' | 'SOLICITAR' {
  return rol === 'ADMIN' ? 'APLICAR' : 'SOLICITAR'
}

/** Solo un ADMIN puede resolver (autorizar/rechazar) una solicitud. */
export function puedeResolverCorreccion(rol: RolCorreccion): boolean {
  return rol === 'ADMIN'
}

/** Estado de pago en el que ya no se puede corregir el precio. */
export function pedidoCorregible(estadoEntrega: string, estado: string): boolean {
  const cerrado = new Set(['CANCELADO', 'ANULADO'])
  return !cerrado.has(estadoEntrega) && !cerrado.has(estado)
}
