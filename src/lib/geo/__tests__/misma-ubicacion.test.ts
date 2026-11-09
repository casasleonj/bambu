// @tests #426 — regla compartida «misma ubicación» (servidor y pantalla).
import { describe, it, expect } from 'vitest'
import { aPuntoGeo, mismaUbicacion, TOLERANCIA_GRADOS } from '../misma-ubicacion'

describe('mismaUbicacion', () => {
  it('a ~5 m es la misma; más lejos, no', () => {
    expect(mismaUbicacion({ lat: 8.7479, lng: -75.8814 }, { lat: 8.74791, lng: -75.88141 })).toBe(true)
    expect(mismaUbicacion({ lat: 8.7479, lng: -75.8814 }, { lat: 8.7479 + TOLERANCIA_GRADOS * 3, lng: -75.8814 })).toBe(false)
    expect(mismaUbicacion({ lat: 8.7479, lng: -75.8814 }, { lat: 8.7455, lng: -75.883 })).toBe(false)
  })
})

describe('aPuntoGeo', () => {
  it('null/undefined/no numérico nunca se vuelve (0,0)', () => {
    expect(aPuntoGeo(null, null)).toBeNull()
    expect(aPuntoGeo(undefined, 5)).toBeNull()
    expect(aPuntoGeo('abc', '1')).toBeNull()
    expect(aPuntoGeo(NaN, 1)).toBeNull()
  })
  it('acepta números y cadenas numéricas (Decimal de Prisma)', () => {
    expect(aPuntoGeo('8.7479', '-75.8814')).toEqual({ lat: 8.7479, lng: -75.8814 })
    expect(aPuntoGeo(0, 0)).toEqual({ lat: 0, lng: 0 }) // cero real, no ausencia
  })
})
