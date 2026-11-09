/** ~5 m: por debajo de esto dos puntos se consideran el mismo (servidor y pantalla usan la misma regla). */
export const TOLERANCIA_GRADOS = 0.00005

export interface PuntoGeo {
  lat: number
  lng: number
}

export const mismaUbicacion = (a: PuntoGeo, b: PuntoGeo): boolean =>
  Math.abs(a.lat - b.lat) <= TOLERANCIA_GRADOS && Math.abs(a.lng - b.lng) <= TOLERANCIA_GRADOS

/** Punto válido o null: `null`/`undefined`/no numérico NUNCA se convierte en (0,0). */
export const aPuntoGeo = (lat: unknown, lng: unknown): PuntoGeo | null =>
  lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))
    ? null
    : { lat: Number(lat), lng: Number(lng) }
