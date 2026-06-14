/**
 * Distancia haversine entre 2 puntos lat/lng en km.
 * Modelo: Tierra esférica con radio 6371 km. Error < 0.5% en la práctica
 * (la Tierra es oblata, no esférica, pero para ruteo es más que suficiente).
 *
 * Para Colombia, Bogotá→Medellín ≈ 250 km por Haversine (real por carretera: ~415 km).
 * El factor carretera-vs-pájaro es ~1.5-1.7x en zonas montañosas rurales.
 *
 * Ver: https://en.wikipedia.org/wiki/Haversine_formula
 */

const EARTH_RADIUS_KM = 6371

export interface LatLng {
  lat: number
  lng: number
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
