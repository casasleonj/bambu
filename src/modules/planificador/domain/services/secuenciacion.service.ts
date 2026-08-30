/**
 * Secuenciación de paradas dentro de un grupo (ADR-PLANIFICADOR-001, v4 §19).
 *
 * REUTILIZA `optimizeRuta` (NN + 2-opt) de `src/lib/geo/tsp.ts`. La secuencia
 * es una PROPUESTA de recorrido, no evidencia de que el repartidor la siga.
 *
 * Paradas sin coords quedan al final, en el orden de entrada — no se inventan
 * coordenadas (v4 §9). El motor ya marcó esos pedidos con excepción
 * `LOW_LOCATION_CONFIDENCE` aguas arriba.
 */

import { optimizeRuta, type TSPPoint } from '@/lib/geo/tsp'

export interface ParadaSecuenciable {
  /** id de la parada lógica (cliente o cliente+negocio). */
  key: string
  lat: number | null
  lng: number | null
}

export interface SecuenciaResult {
  /** keys en orden de visita propuesto. */
  orden: string[]
  distanciaKm: number
  /** keys sin coords, van al final. */
  sinCoords: string[]
}

export function secuenciar(paradas: ParadaSecuenciable[]): SecuenciaResult {
  const conCoords: TSPPoint[] = []
  const sinCoords: string[] = []

  for (const p of paradas) {
    if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      conCoords.push({ id: p.key, lat: p.lat, lng: p.lng })
    } else {
      sinCoords.push(p.key)
    }
  }

  if (conCoords.length === 0) {
    return { orden: [...sinCoords], distanciaKm: 0, sinCoords }
  }
  if (conCoords.length === 1) {
    return { orden: [conCoords[0].id, ...sinCoords], distanciaKm: 0, sinCoords }
  }

  const r = optimizeRuta(conCoords)
  return {
    orden: [...r.orden.map((p) => p.id), ...sinCoords],
    distanciaKm: Math.round(r.distanciaKm * 100) / 100,
    sinCoords,
  }
}
