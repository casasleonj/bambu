/**
 * Calidad de ubicación — value object derivado en runtime (ADR-PLANIFICADOR-004 §2).
 *
 * NO es una columna. Se calcula a partir de `Cliente.lat/lng/geocodeOrigen/geocodeAt`
 * (o `Negocio.lat/lng`, que no tiene origen → se trata como APROX).
 *
 *   PRECISE     coords con origen confiable y recientes
 *   APPROX      coords viejas o de origen NEGOCIO
 *   BARRIO_ONLY sin coords pero con barrio
 *   NONE        nada
 */

export type LocationQuality = 'PRECISE' | 'APPROX' | 'BARRIO_ONLY' | 'NONE'

/** Orígenes de geocode que se consideran confiables para PRECISE. */
const ORIGEN_CONFIABLE = new Set(['MANUAL', 'PARSED_URL', 'GPS_HISTORIAL'])

/** Antigüedad máxima (meses) para que unas coords cuenten como PRECISE. */
export const MESES_FRESCURA_COORDS = 6

export interface LocationQualityInput {
  lat: number | null | undefined
  lng: number | null | undefined
  /** `Cliente.geocodeOrigen`. `undefined` si la fuente es `Negocio` (no lo tiene). */
  geocodeOrigen?: string | null
  /** `Cliente.geocodeAt`. */
  geocodeAt?: Date | string | null
  /** Hay barrio (efectivo) disponible. */
  tieneBarrio: boolean
}

function tieneCoords(lat: unknown, lng: unknown): boolean {
  if (lat == null || lng == null) return false
  const a = Number(lat)
  const b = Number(lng)
  return Number.isFinite(a) && Number.isFinite(b)
}

function mesesDesde(fecha: Date | string | null | undefined, ahora: Date): number {
  if (!fecha) return Infinity
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  if (Number.isNaN(d.getTime())) return Infinity
  return (ahora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
}

export function deriveLocationQuality(
  input: LocationQualityInput,
  ahora: Date = new Date(),
): LocationQuality {
  if (!tieneCoords(input.lat, input.lng)) {
    return input.tieneBarrio ? 'BARRIO_ONLY' : 'NONE'
  }

  // Fuente Negocio (sin geocodeOrigen conocido): APPROX salvo evidencia mejor.
  if (input.geocodeOrigen === undefined) return 'APPROX'

  const origenOk = !!input.geocodeOrigen && ORIGEN_CONFIABLE.has(input.geocodeOrigen)
  if (!origenOk) return 'APPROX'

  // MANUAL sin fecha se acepta (alguien la puso a mano). El resto exige frescura.
  if (input.geocodeOrigen === 'MANUAL' && !input.geocodeAt) return 'PRECISE'

  return mesesDesde(input.geocodeAt, ahora) < MESES_FRESCURA_COORDS ? 'PRECISE' : 'APPROX'
}

/** ¿Esta calidad sirve para clustering/secuenciación con punto exacto? */
export function esUbicable(q: LocationQuality): boolean {
  return q === 'PRECISE' || q === 'APPROX'
}
