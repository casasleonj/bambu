/**
 * Regla única de resolución de ruta efectiva de un pedido.
 *
 * Mismo patrón que `pickCoords` (src/lib/geo/pedido-coords.ts): negocio con
 * rutaId propio gana; si no, cae al rutaId del cliente; `null` si ninguna
 * fuente tiene ruta asignada.
 *
 * OJO: `Cliente.rutaId` existe en el schema pero no tiene flujo de escritura
 * en la UI (solo `Negocio.rutaId` es editable vía negocio-form.tsx) — en
 * producción esta función devolverá `null` para la mayoría de pedidos de
 * domicilio (Cliente sin Negocio). Los consumidores de `pickRutaId` deben
 * tener un fallback explícito para el caso `null`, no asumir cobertura total.
 */

export interface RutaSource {
  rutaId: string | null
}

export interface PedidoRutaInput {
  cliente?: RutaSource | null
  negocio?: RutaSource | null
}

/** Resuelve la ruta efectiva de un pedido. `null` si ninguna fuente tiene ruta asignada. */
export function pickRutaId(p: PedidoRutaInput): string | null {
  if (p.negocio?.rutaId) return p.negocio.rutaId
  if (p.cliente?.rutaId) return p.cliente.rutaId
  return null
}
