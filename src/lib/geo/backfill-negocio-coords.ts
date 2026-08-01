/**
 * Backfill de coordenadas para un Negocio.
 *
 * Estrategia de prioridad (espejo de `backfillClienteCoords`):
 *   1. linkUbicacion parseado (PARSED_URL) — incluye expansión de short URLs
 *      (maps.app.goo.gl / goo.gl/maps) vía redirect server-side.
 *   2. Mediana de Pedido.gpsLat/gpsLng confirmados con ese negocioId
 *      (GPS_HISTORIAL) — robusta a outliers, misma razón que en cliente.
 *   3. null — no se puede geocodificar.
 *
 * `Negocio` no tiene columnas `geocodeOrigen`/`geocodeAt` (decisión: evitar
 * migración); la procedencia se audita vía `logAudit` en el caller.
 *
 * @tests unit con prisma mockeado: src/lib/geo/__tests__/backfill-negocio-coords.test.ts
 */

import { prisma } from '@/lib/prisma'
import { parseGoogleMapsLink, isShortMapsUrl } from './parse-google-maps-link'
import { expandShortMapsUrl } from './expand-short-maps-url'

export interface GeocodeResult {
  lat: number
  lng: number
  origen: 'PARSED_URL' | 'GPS_HISTORIAL'
}

const MAX_GPS_SAMPLES = 50 // últimos 50 pedidos confirmados

export async function backfillNegocioCoords(negocioId: string): Promise<GeocodeResult | null> {
  const negocio = await prisma.negocio.findUnique({
    where: { id: negocioId },
    select: { id: true, linkUbicacion: true },
  })
  if (!negocio) return null

  // 1. Parsear linkUbicacion (incluye short URLs expandidas)
  if (negocio.linkUbicacion) {
    const parsed = parseGoogleMapsLink(negocio.linkUbicacion)
    if (parsed) {
      return { lat: parsed.lat, lng: parsed.lng, origen: 'PARSED_URL' }
    }
    if (isShortMapsUrl(negocio.linkUbicacion)) {
      const expanded = await expandShortMapsUrl(negocio.linkUbicacion)
      if (expanded) {
        const parsedExpanded = parseGoogleMapsLink(expanded)
        if (parsedExpanded) {
          return { lat: parsedExpanded.lat, lng: parsedExpanded.lng, origen: 'PARSED_URL' }
        }
      }
    }
  }

  // 2. Mediana GPS historial (pedidos ENTREGADOS con GPS de este negocio)
  const pedidosConGps = await prisma.pedido.findMany({
    where: {
      negocioId,
      estadoEntrega: 'ENTREGADO',
      gpsLat: { not: null },
      gpsLng: { not: null },
    },
    select: { gpsLat: true, gpsLng: true },
    orderBy: { fechaEntrega: 'desc' },
    take: MAX_GPS_SAMPLES,
  })
  if (pedidosConGps.length >= 2) {
    const lats = pedidosConGps.map(p => Number(p.gpsLat)).sort((a, b) => a - b)
    const lngs = pedidosConGps.map(p => Number(p.gpsLng)).sort((a, b) => a - b)
    const lat = median(lats)
    const lng = median(lngs)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, origen: 'GPS_HISTORIAL' }
    }
  }

  return null
}

function median(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return NaN
  const mid = Math.floor(n / 2)
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Persiste el resultado del backfill en `Negocio.lat/lng`. Si `result` es
 * null, limpia las coords (vuelve a "sin coords").
 */
export async function persistNegocioCoords(
  negocioId: string,
  result: GeocodeResult | null,
): Promise<void> {
  await prisma.negocio.update({
    where: { id: negocioId },
    data: {
      lat: result?.lat ?? null,
      lng: result?.lng ?? null,
    },
  })
}
