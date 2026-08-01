// @tests pedido-coords — Bloque 6 (regla única de coords efectivas)
// Contrato schema.prisma: "Si Negocio tiene coords propias, gana".
// Resolución: negocio con coords válidas → negocio; si no → cliente.

import { describe, it, expect } from 'vitest'
import { pickCoords } from '../pedido-coords'

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
})
