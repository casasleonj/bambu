/**
 * Regla ÚNICA de resolución de coordenadas efectivas de un pedido.
 *
 * Contrato documentado en `prisma/schema.prisma` (modelo Negocio, comentario
 * sobre `lat`/`lng`): "Si Negocio tiene coords propias, gana". Los 5
 * consumidores (TSP, Maps del repartidor, payload API de pedidos, SSR de
 * /pedidos, validación GPS) usan ESTA función para que no diverjan.
 *
 * Resolución: negocio con coords válidas → negocio; si no → cliente.
 * `Number` cast (los campos son Decimal nullable) + `isFinite`.
 */

export interface CoordSource {
  lat: unknown
  lng: unknown
  nombre?: string | null
}

export interface PedidoCoordInput {
  cliente?: CoordSource | null
  negocio?: CoordSource | null
}

export interface EffectiveCoords {
  lat: number
  lng: number
  nombre: string | null
}

function firstValid(sources: Array<CoordSource | null | undefined>): EffectiveCoords | null {
  for (const s of sources) {
    if (!s) continue
    // Ojo: Number(null) === 0 → coords (0,0) en el Golfo de Guinea.
    // Fuentes sin coords (null/undefined) se saltan ANTES del cast.
    if (s.lat == null || s.lng == null) continue
    const lat = Number(s.lat)
    const lng = Number(s.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, nombre: s.nombre ?? null }
    }
  }
  return null
}

/** Resuelve las coords efectivas de un pedido. `null` si ninguna fuente tiene coords válidas. */
export function pickCoords(p: PedidoCoordInput): EffectiveCoords | null {
  return firstValid([p.negocio, p.cliente])
}
