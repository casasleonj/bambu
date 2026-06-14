/**
 * Parser de URLs de Google Maps → coordenadas (lat, lng).
 *
 * Soporta los formatos más comunes que un usuario puede pegar al pegar
 * "Compartir" desde Google Maps. NO resuelve short URLs (`maps.app.goo.gl/...`,
 * `goo.gl/maps/...`) — esas requieren un HTTP redirect que no se puede
 * hacer en pure client-side. Devuelven `null` y se reporta "Link no
 * reconocido" en la UI.
 *
 * Formatos soportados (todos verificados con docs oficiales de Google):
 *  1. `https://maps.google.com/?q=4.6520,-74.0540`           (seed del sistema)
 *  2. `https://www.google.com/maps/@4.6520,-74.0540,15z`     (Universal)
 *  3. `https://www.google.com/maps/place/Name/@4.6520,-74.0540,17z`
 *  4. `https://www.google.com/maps?q=4.6520,-74.0540`        (formato genérico)
 *  5. `https://www.google.com/maps/dir/?api=1&destination=4.6520,-74.0540`
 *  6. `https://www.google.com/maps/search/?api=1&query=4.6520%2C-74.0540`
 *
 * Lat: [-90, 90]. Lng: [-180, 180]. Bogotá ≈ 4.6, -74.0.
 *
 * Ver docs:
 *  - https://developers.google.com/maps/documentation/urls/get-started
 */

export type CoordsSource =
  | 'Q_PARAM'           // ?q=lat,lng o ?query=lat,lng
  | 'AT_LITERAL'        // /@lat,lng,zoom
  | 'DESTINATION_PARAM' // ?destination=lat,lng
  | 'PATH_COORD'        // /place/.../lat,lng (raro, fallback)

export interface ParsedCoords {
  lat: number
  lng: number
  source: CoordsSource
}

/** Detecta si un string es un short URL que requiere HTTP redirect. */
export function isShortMapsUrl(input: string): boolean {
  if (!input) return false
  const trimmed = input.trim().toLowerCase()
  return (
    trimmed.startsWith('https://maps.app.goo.gl/') ||
    trimmed.startsWith('http://maps.app.goo.gl/') ||
    trimmed.startsWith('https://goo.gl/maps/') ||
    trimmed.startsWith('http://goo.gl/maps/')
  )
}

/**
 * Parsea una URL de Google Maps y devuelve coordenadas, o `null` si no
 * se puede parsear. Pure function — no hace I/O, safe para client-side.
 */
export function parseGoogleMapsLink(input: string | null | undefined): ParsedCoords | null {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // Short URLs → no se puede sin HTTP. Devolver null con marker distinguible.
  if (isShortMapsUrl(trimmed)) return null

  // Tiene que ser un http(s) URL de google.
  const lc = trimmed.toLowerCase()
  if (!lc.startsWith('http://') && !lc.startsWith('https://')) return null
  if (!lc.includes('google.com/maps') && !lc.includes('maps.google.com')) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const params = url.searchParams

  // Formato 1 y 4: ?q=lat,lng o ?query=lat,lng
  for (const key of ['q', 'query']) {
    const v = params.get(key)
    if (v) {
      const c = parseCoordString(v)
      if (c) return { ...c, source: 'Q_PARAM' }
    }
  }

  // Formato 5: ?destination=lat,lng (Directions API)
  const dest = params.get('destination')
  if (dest) {
    const c = parseCoordString(dest)
    if (c) return { ...c, source: 'DESTINATION_PARAM' }
  }

  // Formato 2 y 3: /@lat,lng,zoom en el path
  const atMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),?\d*\.?\d*[a-z]?/)
  if (atMatch) {
    const c = parseCoordString(`${atMatch[1]},${atMatch[2]}`)
    if (c) return { ...c, source: 'AT_LITERAL' }
  }

  // Formato 3 alt: /place/Name/.../@lat,lng,zoom (cubierto arriba)
  // Formato 3 alt-2: /place?q=lat,lng (cubierto arriba)

  return null
}

/**
 * Parsea strings tipo "4.6520,-74.0540" o "4.6520, -74.0540".
 *
 * Convención ESTRICTA: lat,lng. No se auto-detecta el orden. Si el usuario
 * pegó lng,lat por error, retorna null y la UI muestra "Link no reconocido".
 *
 * Razón: el auto-swap (lng,lat → lat,lng) era ambiguo y producía
 * resultados incorrectos en bordes (ej. Ecuador, donde lat ≈ 0).
 * Convención explícita es más predecible.
 */
function parseCoordString(s: string): { lat: number; lng: number } | null {
  if (!s) return null
  const parts = s.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length !== 2) return null
  const a = Number(parts[0])
  const b = Number(parts[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null

  // Convención lat,lng. Validar rangos.
  const inLatRange = (x: number) => x >= -90 && x <= 90
  const inLngRange = (x: number) => x >= -180 && x <= 180

  if (inLatRange(a) && inLngRange(b)) {
    return { lat: a, lng: b }
  }
  return null
}
