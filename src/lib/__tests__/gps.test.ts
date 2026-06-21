// @tests gps.ts — Fase 2 GPS helpers

import { describe, it, expect } from 'vitest'
import {
  haversineKm,
  isWithinDeliveryRadius,
  formatGPSError,
  type GPSCoordinates,
} from '@/lib/gps'

describe('haversineKm', () => {
  it('calcula distancia entre dos puntos conocidos', () => {
    const a: GPSCoordinates = { lat: 4.711, lng: -74.0721 } // Bogotá
    const b: GPSCoordinates = { lat: 6.2476, lng: -75.5658 } // Medellín
    const d = haversineKm(a, b)
    expect(d).toBeGreaterThan(230)
    expect(d).toBeLessThan(260)
  })

  it('retorna 0 para el mismo punto', () => {
    const p: GPSCoordinates = { lat: 4.65, lng: -74.05 }
    expect(haversineKm(p, p)).toBe(0)
  })

  it('es simétrico', () => {
    const a: GPSCoordinates = { lat: 4.65, lng: -74.05 }
    const b: GPSCoordinates = { lat: 4.66, lng: -74.06 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10)
  })
})

describe('isWithinDeliveryRadius', () => {
  it('retorna true cuando la distancia es menor al radio', () => {
    const cliente: GPSCoordinates = { lat: 4.65, lng: -74.05 }
    const gps: GPSCoordinates = { lat: 4.6501, lng: -74.05 } // ~11m
    expect(isWithinDeliveryRadius(gps, cliente, 100)).toBe(true)
  })

  it('retorna false cuando la distancia excede el radio', () => {
    const cliente: GPSCoordinates = { lat: 4.65, lng: -74.05 }
    const gps: GPSCoordinates = { lat: 4.66, lng: -74.05 } // ~1.1km
    expect(isWithinDeliveryRadius(gps, cliente, 100)).toBe(false)
  })

  it('usa 200m como radio por defecto', () => {
    const cliente: GPSCoordinates = { lat: 4.65, lng: -74.05 }
    const gps: GPSCoordinates = { lat: 4.6505, lng: -74.05 } // ~55m
    expect(isWithinDeliveryRadius(gps, cliente)).toBe(true)
  })

  it('retorna false para coordenadas no finitas', () => {
    expect(isWithinDeliveryRadius({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 }, 100)).toBe(false)
    expect(isWithinDeliveryRadius({ lat: 0, lng: Infinity }, { lat: 0, lng: 0 }, 100)).toBe(false)
  })

  it('retorna false para radio <= 0', () => {
    const a: GPSCoordinates = { lat: 4.65, lng: -74.05 }
    expect(isWithinDeliveryRadius(a, a, 0)).toBe(false)
    expect(isWithinDeliveryRadius(a, a, -10)).toBe(false)
  })
})

describe('formatGPSError', () => {
  it('devuelve mensaje en español para cada código conocido', () => {
    expect(formatGPSError('PERMISSION_DENIED')).toContain('Permiso')
    expect(formatGPSError('POSITION_UNAVAILABLE')).toContain('GPS')
    expect(formatGPSError('TIMEOUT')).toContain('tardó')
    expect(formatGPSError('NOT_SUPPORTED')).toContain('dispositivo')
    expect(formatGPSError('UNKNOWN')).toContain('desconocido')
  })
})
