import { describe, it, expect } from 'vitest'
import { deriveLocationQuality } from '../LocationQuality'

const AHORA = new Date('2026-08-30T12:00:00-05:00')

describe('deriveLocationQuality', () => {
  it('sin coords, con barrio → BARRIO_ONLY', () => {
    expect(
      deriveLocationQuality({ lat: null, lng: null, tieneBarrio: true }, AHORA),
    ).toBe('BARRIO_ONLY')
  })

  it('sin coords, sin barrio → NONE', () => {
    expect(
      deriveLocationQuality({ lat: null, lng: null, tieneBarrio: false }, AHORA),
    ).toBe('NONE')
  })

  it('coords de negocio (geocodeOrigen undefined) → APPROX', () => {
    expect(
      deriveLocationQuality({ lat: 10.03, lng: -73.24, tieneBarrio: true }, AHORA),
    ).toBe('APPROX')
  })

  it('coords PARSED_URL recientes → PRECISE', () => {
    expect(
      deriveLocationQuality(
        { lat: 10.03, lng: -73.24, geocodeOrigen: 'PARSED_URL', geocodeAt: '2026-08-01', tieneBarrio: true },
        AHORA,
      ),
    ).toBe('PRECISE')
  })

  it('coords PARSED_URL viejas (>6 meses) → APPROX', () => {
    expect(
      deriveLocationQuality(
        { lat: 10.03, lng: -73.24, geocodeOrigen: 'PARSED_URL', geocodeAt: '2025-12-01', tieneBarrio: true },
        AHORA,
      ),
    ).toBe('APPROX')
  })

  it('coords MANUAL sin fecha → PRECISE', () => {
    expect(
      deriveLocationQuality(
        { lat: 10.03, lng: -73.24, geocodeOrigen: 'MANUAL', geocodeAt: null, tieneBarrio: false },
        AHORA,
      ),
    ).toBe('PRECISE')
  })

  it('coords con origen NEGOCIO → APPROX', () => {
    expect(
      deriveLocationQuality(
        { lat: 10.03, lng: -73.24, geocodeOrigen: 'NEGOCIO', geocodeAt: '2026-08-01', tieneBarrio: true },
        AHORA,
      ),
    ).toBe('APPROX')
  })
})
