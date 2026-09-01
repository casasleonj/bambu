/**
 * Canal de pedido — `PUNTO` | `DOMICILIO`.
 *
 * G6 (ADR-PEDIDO-ORIGEN-CANAL-001): `canal` es el canal canónico. El campo
 * legacy `Pedido.tipo` (`ENVIO` | `PUNTO`) es 100% derivado: `PUNTO ↔ PUNTO`,
 * `DOMICILIO ↔ ENVIO`. Estos helpers centralizan esa traducción para poder
 * seguir aceptando el query param legacy `?tipo=` mientras se migra a `?canal=`.
 */

export const CANALES = ['PUNTO', 'DOMICILIO'] as const
export type CanalPedido = (typeof CANALES)[number]

/** `Pedido.tipo` (legacy) derivado de `canal` (regla de `PedidoMapper`). */
export function tipoDesdeCanal(canal: string): 'PUNTO' | 'ENVIO' {
  return canal === 'PUNTO' ? 'PUNTO' : 'ENVIO'
}

/**
 * Normaliza los valores de filtro que pueden venir como `canal` (`PUNTO`/
 * `DOMICILIO`) o como el legacy `tipo` (`PUNTO`/`ENVIO`) a canales canónicos,
 * deduplicados. Vacío ⇒ `[]`.
 */
export function normalizeCanalFilter(values: readonly string[]): CanalPedido[] {
  const out = new Set<CanalPedido>()
  for (const v of values) {
    if (v === 'PUNTO') out.add('PUNTO')
    else if (v === 'DOMICILIO' || v === 'ENVIO') out.add('DOMICILIO')
  }
  return [...out]
}
