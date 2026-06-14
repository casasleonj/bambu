/**
 * Backfill de coordenadas para un Cliente.
 *
 * Estrategia de prioridad (definida con el usuario):
 *   1. linkUbicacion parseado (PARSED_URL) — el usuario tipeó coords.
 *   2. Mediana de Pedido.gpsLat/gpsLng confirmados (GPS_HISTORIAL).
 *   3. Coords del Negocio default (NEGOCIO).
 *   4. null — no se puede geocodificar.
 *
 * Devuelve el resultado sin persistir. El caller decide si guardar.
 *
 * Por qué la mediana GPS: si un cliente recibió 10 pedidos y el repartidor
 * confirmó la posición 8 veces (2 veces no prendió el GPS), la mediana de
 * esas 8 posiciones es robusta a outliers (el repartidor apretó "entregué"
 * desde el carro a 200m una vez). El promedio se rompería con un outlier.
 *
 * @tests unit con prisma mockeado: src/lib/geo/__tests__/backfill.test.ts
 */

import { prisma } from '@/lib/prisma'
import { parseGoogleMapsLink } from './parse-google-maps-link'

export type GeocodeOrigen = 'PARSED_URL' | 'GPS_HISTORIAL' | 'NEGOCIO' | 'MANUAL'

export interface GeocodeResult {
  lat: number
  lng: number
  origen: GeocodeOrigen
}

const MAX_GPS_SAMPLES = 50 // últimos 50 pedidos confirmados

export async function backfillClienteCoords(clienteId: string): Promise<GeocodeResult | null> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      linkUbicacion: true,
      negocioDefault: {
        select: { lat: true, lng: true },
      },
    },
  })
  if (!cliente) return null

  // 1. Parsear linkUbicacion
  if (cliente.linkUbicacion) {
    const parsed = parseGoogleMapsLink(cliente.linkUbicacion)
    if (parsed) {
      return { lat: parsed.lat, lng: parsed.lng, origen: 'PARSED_URL' }
    }
  }

  // 2. Mediana GPS historial (últimos N pedidos ENTREGADOS con GPS)
  const pedidosConGps = await prisma.pedido.findMany({
    where: {
      clienteId,
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

  // 3. Negocio default
  if (cliente.negocioDefault?.lat != null && cliente.negocioDefault?.lng != null) {
    return {
      lat: Number(cliente.negocioDefault.lat),
      lng: Number(cliente.negocioDefault.lng),
      origen: 'NEGOCIO',
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
 * Persiste el resultado del backfill. Si `result` es null, limpia lat/lng
 * (vuelve a "sin coords"). Auditoría: actualiza `geocodeOrigen` y
 * `geocodeAt` para que el admin sepa de dónde salieron las coords.
 */
export async function persistClienteCoords(
  clienteId: string,
  result: GeocodeResult | null,
): Promise<void> {
  await prisma.cliente.update({
    where: { id: clienteId },
    data: {
      lat: result?.lat ?? null,
      lng: result?.lng ?? null,
      geocodeOrigen: result?.origen ?? null,
      geocodeAt: result ? new Date() : null,
    },
  })
}
