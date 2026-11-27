import { describe, expect, it } from 'vitest'
import { nearestNeighborOrder, optimizeRuta, routeDistance, twoOpt, type TSPPoint } from '../tsp'

const p = (id: string, lat: number, lng: number): TSPPoint => ({ id, lat, lng })
const planta = p('planta-sanjose', 0, 0)
const a = p('A', 0, 0.01)
const b = p('B', 0, 0.02)
const c = p('C', 0, 0.03)

describe('#930: origen externo y replanificación por paradas', () => {
  it('desde planta no confunde origen con un pedido ni toma el primer elemento de entrada', () => {
    const resultado = nearestNeighborOrder([c, a, b], planta)
    expect(resultado.orden.map(x => x.id)).toEqual(['A', 'B', 'C'])
    expect(resultado.distanciaKm).toBeGreaterThan(3.2) // incluye planta→A
  })

  it('un solo destino externo contabiliza el primer tramo', () => {
    const resultado = optimizeRuta([c], planta)
    expect(resultado.orden.map(x => x.id)).toEqual(['C'])
    expect(resultado.distanciaKm).toBeGreaterThan(3.2)
  })

  it('2-opt no puede devolver un costo superior al original con origen externo', () => {
    const entrada = [c, a, b]
    const resultado = twoOpt(entrada, 100, planta)
    expect(resultado.distanciaKm).toBeLessThanOrEqual(routeDistance(entrada, planta))
    expect(new Set(resultado.orden.map(x => x.id))).toEqual(new Set(['A', 'B', 'C']))
  })

  it('origen incluido entre puntos permanece fijo en posición inicial', () => {
    const resultado = optimizeRuta([b, c, a], a)
    expect(resultado.orden[0].id).toBe('A')
    expect(resultado.orden).toHaveLength(3)
  })

  it('tras completar A reordena B y C sin reintroducir la entrega A', () => {
    const resultado = optimizeRuta([c, b], a)
    expect(resultado.orden.map(x => x.id)).toEqual(['B', 'C'])
  })

  it('sin origen externo mantiene el contrato de 2-opt para dos puntos', () => {
    expect(twoOpt([a, b]).iteraciones).toBe(0)
    expect(routeDistance([a])).toBe(0)
  })

  it('no muta el listado original y no duplica visitas', () => {
    const original = [c, a, b]
    const resultado = optimizeRuta(original, planta)
    expect(original.map(x => x.id)).toEqual(['C', 'A', 'B'])
    expect(new Set(resultado.orden.map(x => x.id)).size).toBe(original.length)
  })
})
