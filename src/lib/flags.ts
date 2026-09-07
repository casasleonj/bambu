/**
 * Feature flags — lectura centralizada de `NEXT_PUBLIC_*`.
 *
 * Next.js inlinea `process.env.NEXT_PUBLIC_X` en build (cliente y servidor),
 * así que estas funciones son seguras en Server y Client Components.
 * Convención del repo: un flag está ON solo con el string exacto `'true'`.
 */

/**
 * `NEXT_PUBLIC_PEDIDOS_V2` — rediseño integral de Pedidos (Pedido Hub).
 * OFF por defecto: la UI de consulta sigue siendo la actual (tabs).
 * Ver docs/pedidos/03-blueprint-experiencia-hub.md.
 */
export function pedidosV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'
}
