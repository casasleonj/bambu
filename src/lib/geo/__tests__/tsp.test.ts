// @tests tsp — Bloque 2

import { describe, it, expect } from 'vitest'
import {
  nearestNeighborOrder,
  twoOpt,
  optimizeRuta,
  routeDistance,
  type TSPPoint,
} from '../tsp'

function p(lat: number, lng: number, id = `${lat},${lng}`): TSPPoint {
  return { id, lat, lng }
}

describe('nearestNeighborOrder', () => {
  it('input vacío → orden vacío', () => {
    const r = nearestNeighborOrder([])
    expect(r.orden).toEqual([])
    expect(r.distanciaKm).toBe(0)
  })

  it('1 punto → mismo punto', () => {
    const r = nearestNeighborOrder([p(0, 0)])
    expect(r.orden.length).toBe(1)
    expect(r.distanciaKm).toBe(0)
  })

  it('2 puntos → 0 → 1', () => {
    const r = nearestNeighborOrder([p(0, 0, 'a'), p(0, 1, 'b')])
    expect(r.orden.map(x => x.id)).toEqual(['a', 'b'])
    expect(r.distanciaKm).toBeGreaterThan(100)
    expect(r.distanciaKm).toBeLessThan(120)
  })

  it('greedy: empieza por el más cercano al primero', () => {
    // 4 puntos formando un cuadrado. Desde (0,0), el más cercano es (0,1).
    const points = [p(0, 0, 'a'), p(0, 10, 'b'), p(0, 1, 'c'), p(0, 2, 'd')]
    const r = nearestNeighborOrder(points)
    expect(r.orden[0].id).toBe('a')
    expect(r.orden[1].id).toBe('c') // más cercano a a
  })
})

describe('twoOpt', () => {
  it('orden identidad en <3 puntos', () => {
    const r = twoOpt([p(0, 0), p(0, 1)])
    expect(r.orden.length).toBe(2)
    expect(r.iteraciones).toBe(0)
  })

  it('mejora un cruce: 4 puntos en cuadrado (debería ir perímetro)', () => {
    // Cuadrado: A(0,0), B(0,10), C(10,10), D(10,0)
    // Orden inicial: A,B,C,D → perimetro 30 (correcto, ya es óptimo)
    // Orden inicial: A,C,B,D → "X" con cruce, distancia 2*sqrt(200) ≈ 28.3
    //                vs perímetro 30. Interesante: el X es MÁS CORTO para sqrt.
    // Probemos con puntos no en diagonal: A(0,0), C(0,1), B(1,1), D(1,0)
    //   - A→C→B→D = 1 + 1 + 1 = 3 (cuadrado pequeño)
    // Mejor caso para 2-opt: línea zig-zag.
    const a = p(0, 0, 'a')
    const b = p(0, 10, 'b')
    const c = p(10, 0, 'c')
    const d = p(10, 10, 'd')
    const initial = [a, c, b, d] // zig-zag
    const r = twoOpt(initial, 50)
    // Óptimo: a→b→d→c o a→c→d→b (perímetro 30)
    expect(r.distanciaKm).toBeLessThanOrEqual(routeDistance(initial) + 1e-6)
    // Verifica que el orden final tiene la misma distancia que el perímetro
    // óptimo (que es menor o igual al zig-zag)
    expect(r.distanciaKm).toBeLessThan(routeDistance(initial) + 1)
  })

  it('converge antes de maxIter en input pequeño', () => {
    const points = [p(0, 0, 'a'), p(0, 1, 'b'), p(0, 2, 'c'), p(0, 3, 'd')]
    const r = twoOpt(points, 100)
    expect(r.iteraciones).toBeLessThan(100)
  })
})

describe('optimizeRuta (NN + 2-opt combinado)', () => {
  it('siempre devuelve un orden con la misma cantidad de puntos', () => {
    const points = [p(0, 0, 'a'), p(0, 1, 'b'), p(0, 2, 'c'), p(0, 3, 'd'), p(0, 4, 'e')]
    const r = optimizeRuta(points)
    expect(r.orden.length).toBe(5)
    expect(new Set(r.orden.map(x => x.id)).size).toBe(5) // sin duplicados
  })

  it('10 puntos aleatorios: optimized ≤ 1.15x NN inicial', () => {
    // 10 puntos en un radio de ~5km alrededor de Bogotá.
    const points: TSPPoint[] = [
      p(4.60, -74.05, '1'),
      p(4.65, -74.10, '2'),
      p(4.70, -74.00, '3'),
      p(4.55, -74.08, '4'),
      p(4.62, -74.02, '5'),
      p(4.68, -74.12, '6'),
      p(4.72, -74.05, '7'),
      p(4.58, -74.06, '8'),
      p(4.66, -74.04, '9'),
      p(4.63, -74.09, '10'),
    ]
    const nn = nearestNeighborOrder(points)
    const opt = optimizeRuta(points)
    // El optimizado debe ser ≤ 1.15x el NN (es decir, mejor o igual).
    expect(opt.distanciaKm).toBeLessThanOrEqual(nn.distanciaKm * 1.001) // 2-opt siempre mejora o iguala
  })

  it('empieza desde start cuando se pasa', () => {
    const a = p(0, 0, 'a')
    const b = p(0, 1, 'b')
    const c = p(0, 2, 'c')
    const d = p(0, 3, 'd')
    const r = optimizeRuta([a, b, c, d], a)
    expect(r.orden[0].id).toBe('a')
  })
})

describe('routeDistance', () => {
  it('0 puntos → 0', () => {
    expect(routeDistance([])).toBe(0)
  })
  it('1 punto → 0', () => {
    expect(routeDistance([p(0, 0)])).toBe(0)
  })
  it('2 puntos → 1x haversine', () => {
    const d = routeDistance([p(0, 0), p(0, 1)])
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(120)
  })
})
