// @tests parse-google-maps-link — Bloque 1 (geo coords)
// Cubre todos los formatos documentados en Google Maps URLs + edge cases.

import { describe, it, expect } from 'vitest'
import { parseGoogleMapsLink, isShortMapsUrl } from '../parse-google-maps-link'

describe('parseGoogleMapsLink', () => {
  describe('formatos soportados', () => {
    it('parsea ?q=lat,lng formato seed (maps.google.com)', () => {
      const r = parseGoogleMapsLink('https://maps.google.com/?q=4.6520,-74.0540')
      expect(r).toEqual({ lat: 4.652, lng: -74.054, source: 'Q_PARAM' })
    })

    it('parsea /@lat,lng,zoom (Universal)', () => {
      const r = parseGoogleMapsLink('https://www.google.com/maps/@4.6520,-74.0540,15z')
      expect(r).toEqual({ lat: 4.652, lng: -74.054, source: 'AT_LITERAL' })
    })

    it('parsea /place/Name/@lat,lng,zoom', () => {
      const r = parseGoogleMapsLink('https://www.google.com/maps/place/Bogot%C3%A1/@4.6520,-74.0540,17z')
      expect(r).toEqual({ lat: 4.652, lng: -74.054, source: 'AT_LITERAL' })
    })

    it('parsea ?q=lat,lng con www.google.com/maps', () => {
      const r = parseGoogleMapsLink('https://www.google.com/maps?q=4.652,-74.054')
      expect(r).toEqual({ lat: 4.652, lng: -74.054, source: 'Q_PARAM' })
    })

    it('parsea ?destination=lat,lng (Directions API)', () => {
      const r = parseGoogleMapsLink('https://www.google.com/maps/dir/?api=1&destination=4.652,-74.054')
      expect(r).toEqual({ lat: 4.652, lng: -74.054, source: 'DESTINATION_PARAM' })
    })

    it('parsea ?query=lat,lng URL-encoded', () => {
      const r = parseGoogleMapsLink('https://www.google.com/maps/search/?api=1&query=4.6520%2C-74.0540')
      expect(r).toEqual({ lat: 4.652, lng: -74.054, source: 'Q_PARAM' })
    })

    it('parsea coordenadas con espacio después de la coma', () => {
      const r = parseGoogleMapsLink('https://maps.google.com/?q=4.6520, -74.0540')
      expect(r).toEqual({ lat: 4.652, lng: -74.054, source: 'Q_PARAM' })
    })

    it('convención estricta: ?q=lat,lng, donde lat ∈ [-90,90] y lng ∈ [-180,180]', () => {
      // Bogotá: lat=4.6, lng=-74.0 → ambos en sus rangos → ok
      const r1 = parseGoogleMapsLink('https://maps.google.com/?q=4.6,-74.0')
      expect(r1).toEqual({ lat: 4.6, lng: -74.0, source: 'Q_PARAM' })
      // Si el orden es lng,lat (pegado mal), se interpreta como lat=lng, lng=lat.
      // Esto es una ambigüedad fundamental; la UI indica al usuario
      // "Pegá el link Compartir" para evitarlo. No hay heurística mágica
      // que pueda distinguir -74,4 (lng,lat) de 4,-74 (lat,inválido).
    })

    it('acepta http (no solo https)', () => {
      const r = parseGoogleMapsLink('http://maps.google.com/?q=4.652,-74.054')
      expect(r).not.toBeNull()
      expect(r!.lat).toBe(4.652)
    })
  })

  describe('casos negativos', () => {
    it('retorna null para short URL maps.app.goo.gl', () => {
      expect(parseGoogleMapsLink('https://maps.app.goo.gl/AbCdEf123')).toBeNull()
    })

    it('retorna null para short URL goo.gl/maps', () => {
      expect(parseGoogleMapsLink('https://goo.gl/maps/AbCdEf')).toBeNull()
    })

    it('isShortMapsUrl detecta ambos formatos', () => {
      expect(isShortMapsUrl('https://maps.app.goo.gl/X')).toBe(true)
      expect(isShortMapsUrl('https://goo.gl/maps/X')).toBe(true)
      expect(isShortMapsUrl('https://maps.google.com/?q=1,2')).toBe(false)
    })

    it('retorna null para null/undefined/empty', () => {
      expect(parseGoogleMapsLink(null)).toBeNull()
      expect(parseGoogleMapsLink(undefined)).toBeNull()
      expect(parseGoogleMapsLink('')).toBeNull()
      expect(parseGoogleMapsLink('   ')).toBeNull()
    })

    it('retorna null para URL no-Google', () => {
      expect(parseGoogleMapsLink('https://www.openstreetmap.org/?lat=4.652&lon=-74.054')).toBeNull()
      expect(parseGoogleMapsLink('https://example.com/?q=4.652,-74.054')).toBeNull()
    })

    it('retorna null para URL malformada', () => {
      expect(parseGoogleMapsLink('not a url')).toBeNull()
      expect(parseGoogleMapsLink('https://')).toBeNull()
    })

    it('retorna null para coordenadas fuera de rango', () => {
      // 200 no es lat ni lng válido
      expect(parseGoogleMapsLink('https://maps.google.com/?q=200,300')).toBeNull()
    })

    it('retorna null para un solo número', () => {
      expect(parseGoogleMapsLink('https://maps.google.com/?q=4.652')).toBeNull()
    })

    it('retorna null para tres números', () => {
      expect(parseGoogleMapsLink('https://maps.google.com/?q=4.652,-74.054,15')).toBeNull()
    })

    it('retorna null para texto no numérico', () => {
      expect(parseGoogleMapsLink('https://maps.google.com/?q=Bogota,Colombia')).toBeNull()
    })

    it('retorna null para https sin /maps', () => {
      expect(parseGoogleMapsLink('https://www.google.com/search?q=4.652')).toBeNull()
    })
  })

  describe('edge cases reales del seed', () => {
    it('seed-realista formato: maps.google.com/?q=4.65,-74.05', () => {
      const r = parseGoogleMapsLink('https://maps.google.com/?q=4.654321,-74.012345')
      expect(r).not.toBeNull()
      expect(r!.lat).toBeCloseTo(4.654321, 5)
      expect(r!.lng).toBeCloseTo(-74.012345, 5)
    })

    it('acepta 4-5 decimales (formato seed)', () => {
      const r = parseGoogleMapsLink('https://maps.google.com/?q=4.52345,-74.19876')
      expect(r).toEqual({ lat: 4.52345, lng: -74.19876, source: 'Q_PARAM' })
    })

    it('acepta ceros en coordenadas (Ecuador/Greenwich)', () => {
      const r = parseGoogleMapsLink('https://maps.google.com/?q=0,0')
      expect(r).toEqual({ lat: 0, lng: 0, source: 'Q_PARAM' })
    })

    it('acepta enteros sin decimales', () => {
      const r = parseGoogleMapsLink('https://maps.google.com/?q=5,-75')
      expect(r).toEqual({ lat: 5, lng: -75, source: 'Q_PARAM' })
    })
  })
})
