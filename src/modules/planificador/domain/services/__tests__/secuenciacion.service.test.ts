import { describe, it, expect } from 'vitest'
import { secuenciar } from '../secuenciacion.service'

describe('secuenciar', () => {
  it('0 paradas → vacío', () => {
    expect(secuenciar([])).toEqual({ orden: [], distanciaKm: 0, sinCoords: [] })
  })

  it('1 parada con coords → esa parada', () => {
    const r = secuenciar([{ key: 'a', lat: 10, lng: -73 }])
    expect(r.orden).toEqual(['a'])
    expect(r.distanciaKm).toBe(0)
  })

  it('paradas sin coords van al final, en orden de entrada', () => {
    const r = secuenciar([
      { key: 'a', lat: 10.0, lng: -73.0 },
      { key: 'sinc1', lat: null, lng: null },
      { key: 'b', lat: 10.01, lng: -73.0 },
      { key: 'sinc2', lat: null, lng: null },
    ])
    expect(r.sinCoords).toEqual(['sinc1', 'sinc2'])
    expect(r.orden.slice(-2)).toEqual(['sinc1', 'sinc2'])
    expect(r.orden.slice(0, 2).sort()).toEqual(['a', 'b'])
  })

  it('optimiza el orden: ruta en línea se recorre en secuencia', () => {
    // 4 puntos en línea oeste→este, entrada desordenada
    const r = secuenciar([
      { key: 'p3', lat: 10.0, lng: -73.0 },
      { key: 'p1', lat: 10.0, lng: -73.03 },
      { key: 'p4', lat: 10.0, lng: -72.99 },
      { key: 'p2', lat: 10.0, lng: -73.02 },
    ])
    // el óptimo es p1-p2-p3-p4 o su reverso
    const s = r.orden.join('')
    expect(s === 'p1p2p3p4' || s === 'p4p3p2p1').toBe(true)
    expect(r.distanciaKm).toBeGreaterThan(0)
  })
})
