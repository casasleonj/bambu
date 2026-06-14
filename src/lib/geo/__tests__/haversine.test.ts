// @tests haversine — Bloque 1 (geo coords)

import { describe, it, expect } from 'vitest'
import { haversineKm } from '../haversine'

describe('haversineKm', () => {
  it('Bogotá → Medellín ≈ 250 km (pájaro)', () => {
    // Bogotá: 4.7110, -74.0721
    // Medellín: 6.2476, -75.5658
    const d = haversineKm({ lat: 4.711, lng: -74.0721 }, { lat: 6.2476, lng: -75.5658 })
    // Real distance bird-fly: ~245 km según varias fuentes.
    // Toleramos ±10 km por redondeo de coords.
    expect(d).toBeGreaterThan(220)
    expect(d).toBeLessThan(260)
  })

  it('mismo punto → 0 km', () => {
    const d = haversineKm({ lat: 4.652, lng: -74.054 }, { lat: 4.652, lng: -74.054 })
    expect(d).toBe(0)
  })

  it('simétrico: a→b === b→a', () => {
    const a = { lat: 4.652, lng: -74.054 }
    const b = { lat: 4.7, lng: -74.1 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10)
  })

  it('1 grado de latitud ≈ 111 km', () => {
    // En el ecuador, 1 grado de latitud ≈ 111.32 km
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })

  it('1 grado de longitud en ecuador ≈ 111 km, en polo ≈ 0', () => {
    const ecuador = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    const polo = haversineKm({ lat: 89, lng: 0 }, { lat: 89, lng: 1 })
    expect(ecuador).toBeGreaterThan(110)
    expect(ecuador).toBeLessThan(112)
    expect(polo).toBeLessThan(2) // cerca del polo, 1 grado de lng ≈ 0 km
  })

  it('coordenadas negativas (hemisferio sur/oeste) funcionan', () => {
    const d = haversineKm({ lat: -33.45, lng: -70.66 }, { lat: -34.6, lng: -58.38 })
    // Santiago → Buenos Aires ≈ 1130 km
    expect(d).toBeGreaterThan(1000)
    expect(d).toBeLessThan(1200)
  })
})
