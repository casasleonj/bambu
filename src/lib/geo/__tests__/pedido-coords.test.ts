// @tests pedido-coords — Bloque 6 (regla única de coords efectivas)
// Contrato schema.prisma: "Si Negocio tiene coords propias, gana".
// Resolución: negocio con coords válidas → negocio; si no → cliente.

import { describe, it, expect } from 'vitest'
import { mapsLinkDeCoords, pickCoords } from '../pedido-coords'

describe('pickCoords', () => {
  it('negocio gana cuando tiene coords válidas', () => {
    const r = pickCoords({
      cliente: { lat: 1, lng: 1, nombre: 'Cliente A' },
      negocio: { lat: 4.65, lng: -74.05, nombre: 'Negocio X' },
    })
    expect(r).toEqual({ lat: 4.65, lng: -74.05, nombre: 'Negocio X' })
  })

  it('cae a cliente si negocio no tiene coords', () => {
    const r = pickCoords({
      cliente: { lat: 4.6, lng: -74.0, nombre: 'Cliente A' },
      negocio: { lat: null, lng: null, nombre: 'Negocio X' },
    })
    expect(r).toEqual({ lat: 4.6, lng: -74.0, nombre: 'Cliente A' })
  })

  it('cae a cliente si negocio tiene coords inválidas', () => {
    const r = pickCoords({
      cliente: { lat: 4.6, lng: -74.0 },
      negocio: { lat: undefined, lng: undefined },
    })
    expect(r).toEqual({ lat: 4.6, lng: -74.0, nombre: null })
  })

  it('null si ninguna fuente tiene coords', () => {
    expect(pickCoords({ cliente: { lat: null, lng: null }, negocio: { lat: null, lng: null } })).toBeNull()
    expect(pickCoords({})).toBeNull()
    expect(pickCoords({ cliente: null, negocio: null })).toBeNull()
  })

  it('acepta valores Decimal-like (string) y los castea a number', () => {
    const r = pickCoords({
      cliente: { lat: '4.60', lng: '-74.05' },
      negocio: null,
    })
    expect(r).toEqual({ lat: 4.6, lng: -74.05, nombre: null })
    expect(typeof r!.lat).toBe('number')
  })

  it('descartar NaN/Infinity', () => {
    expect(pickCoords({ cliente: { lat: NaN, lng: -74.05 } })).toBeNull()
    expect(pickCoords({ cliente: { lat: Infinity, lng: -74.05 } })).toBeNull()
  })

  describe('coords propias del pedido (entregaLat/entregaLng)', () => {
    it('GANAN sobre negocio y cliente: es el destino de ESTE pedido', () => {
      const r = pickCoords({
        pedido: { lat: 4.7, lng: -74.1 },
        negocio: { lat: 4.6, lng: -74.0 },
        cliente: { lat: 4.5, lng: -73.9 },
      })
      expect(r).toEqual({ lat: 4.7, lng: -74.1, nombre: null })
    })
    it('sin coords propias, se mantiene negocio → cliente', () => {
      expect(pickCoords({ pedido: { lat: null, lng: null }, negocio: { lat: 4.6, lng: -74.0 } }))
        .toEqual({ lat: 4.6, lng: -74.0, nombre: null })
      expect(pickCoords({ pedido: null, cliente: { lat: 4.5, lng: -73.9 } }))
        .toEqual({ lat: 4.5, lng: -73.9, nombre: null })
    })
    it('coords propias a medias (solo lat) no cuentan', () => {
      expect(pickCoords({ pedido: { lat: 4.7, lng: null }, cliente: { lat: 4.5, lng: -73.9 } }))
        .toEqual({ lat: 4.5, lng: -73.9, nombre: null })
    })
    it('Decimal-like (string) se castea a number', () => {
      const r = pickCoords({ pedido: { lat: '4.700000', lng: '-74.100000' } })
      expect(r).toEqual({ lat: 4.7, lng: -74.1, nombre: null })
    })
  })
})

describe('mapsLinkDeCoords', () => {
  it('arma el link de Maps con 6 decimales', () => {
    expect(mapsLinkDeCoords(4.711, -74.0721)).toBe('https://www.google.com/maps/search/?api=1&query=4.711000,-74.072100')
    expect(mapsLinkDeCoords('4.7', '-74.1')).toBe('https://www.google.com/maps/search/?api=1&query=4.700000,-74.100000')
  })
  it('null si faltan o no son válidas', () => {
    expect(mapsLinkDeCoords(null, -74)).toBeNull()
    expect(mapsLinkDeCoords(NaN, 1)).toBeNull()
    expect(mapsLinkDeCoords(undefined, undefined)).toBeNull()
  })
})
