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

/**
 * `NEXT_PUBLIC_CIERRE_V2` — cierre de embarque con entrega por línea, estado
 * derivado de las cantidades, panel de dinero y venta libre con buscador.
 * OFF por defecto: el wizard de cierre actual no cambia (épica #447, Fase A).
 */
export function cierreV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_CIERRE_V2 === 'true'
}

/**
 * `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` — «Entregar después» en la venta
 * rápida (ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001): el cliente paga hoy y recoge o
 * recibe después. OFF por defecto; el servidor ignora `entregado: false` sin él.
 */
export function ventaRutaEntregaPosteriorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR === 'true'
}
