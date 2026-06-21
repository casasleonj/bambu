/**
 * GPS domain helpers.
 *
 * Pure functions for distance calculation, delivery-radius checks and
 * user-facing error messages. Kept independent of React/Next so it can be
 * used in hooks, API routes and tests.
 */

const EARTH_RADIUS_KM = 6371
const DEFAULT_DELIVERY_RADIUS_METERS = 200

export interface GPSCoordinates {
  lat: number
  lng: number
  accuracy?: number
}

export type GPSErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNKNOWN'
  | 'NOT_SUPPORTED'

export interface GPSError {
  code: GPSErrorCode
  message: string
}

export function haversineKm(a: GPSCoordinates, b: GPSCoordinates): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * Check if the captured GPS position is within the delivery radius of the
 * target location (client/negocio coords). Default radius is 200m, which
 * works for rural addresses where GPS accuracy can be low.
 */
export function isWithinDeliveryRadius(
  gps: GPSCoordinates,
  target: GPSCoordinates,
  radiusMeters = DEFAULT_DELIVERY_RADIUS_METERS
): boolean {
  if (!Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return false
  if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return false
  if (radiusMeters <= 0) return false

  const distanceMeters = haversineKm(gps, target) * 1000
  return distanceMeters <= radiusMeters
}

export function formatGPSError(code: GPSErrorCode): string {
  switch (code) {
    case 'PERMISSION_DENIED':
      return 'Permiso de ubicación denegado. Activa el GPS en la configuración del navegador.'
    case 'POSITION_UNAVAILABLE':
      return 'No se pudo obtener la ubicación. Verifica que el GPS esté encendido y tengas señal.'
    case 'TIMEOUT':
      return 'El GPS tardó demasiado en responder. Inténtalo de nuevo en una zona abierta.'
    case 'NOT_SUPPORTED':
      return 'Este dispositivo no soporta geolocalización.'
    case 'UNKNOWN':
    default:
      return 'Error desconocido al obtener la ubicación.'
  }
}
