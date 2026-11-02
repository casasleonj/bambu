/**
 * Textos de la interfaz cuando anular o cancelar un pedido mueve el saldo a favor del cliente (#577).
 * Lenguaje para personal no técnico: qué se restó, qué no se pudo restar y por qué.
 */

export interface ResultadoSaldoFavor {
  saldoFavorRevertido?: number
  saldoFavorYaUsado?: number
  saldoFavorCliente?: number
}

type Dinero = (n: number) => string

/** null cuando el pedido no tenía saldo a favor que mover. */
export function mensajeSaldoFavor(r: ResultadoSaldoFavor | undefined, dinero: Dinero): string | null {
  const restado = r?.saldoFavorRevertido ?? 0
  const usado = r?.saldoFavorYaUsado ?? 0
  if (restado <= 0 && usado <= 0) return null
  const ahora = r?.saldoFavorCliente !== undefined ? ` El saldo a favor del cliente ahora es ${dinero(r.saldoFavorCliente)}.` : ''
  if (usado <= 0) return `Se restaron ${dinero(restado)} del saldo a favor del cliente.${ahora}`
  if (restado <= 0) {
    return `${dinero(usado)} que este pedido había pasado al saldo a favor ya se habían usado en otros pedidos, y no se pueden deshacer.${ahora}`
  }
  return `Se restaron ${dinero(restado)}. Los otros ${dinero(usado)} ya se habían usado en otros pedidos y no se pueden deshacer.${ahora}`
}

export function hayParteYaUsada(r: ResultadoSaldoFavor | undefined): boolean {
  return (r?.saldoFavorYaUsado ?? 0) > 0
}
