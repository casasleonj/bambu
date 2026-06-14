/**
 * TSP heurístico: Nearest-Neighbor + 2-opt.
 *
 * Por qué no OSRM / VROOM (decisión de Iter 0, confirmada con el usuario):
 *  - $0/mes, sin Docker, sin VPS, sin internet.
 *  - Suficiente para 1-25 stops por ruta (caso actual).
 *  - Peor que OSRM en ~5-15% en distancia, pero estrictamente mejor que
 *    ruteo manual / orden de creación / alfabético.
 *
 * Algoritmo:
 *  1. Nearest-Neighbor (greedy): O(N²). Para N=25, ~625 ops. Trivial.
 *  2. 2-opt improvement: intercambia aristas hasta convergencia. Converge
 *     en ~50 iteraciones para N=25.
 *
 * Ver: https://en.wikipedia.org/wiki/2-opt
 */

import { haversineKm, type LatLng } from './haversine'

export interface TSPPoint extends LatLng {
  id: string
}

/**
 * Nearest-Neighbor: greedy, parte del primer punto (o de `start` si se da).
 * Devuelve el orden de visita y la distancia total.
 */
export function nearestNeighborOrder(
  points: TSPPoint[],
  start?: TSPPoint,
): { orden: TSPPoint[]; distanciaKm: number } {
  if (points.length === 0) return { orden: [], distanciaKm: 0 }
  if (points.length === 1) return { orden: [...points], distanciaKm: 0 }

  const remaining = [...points]
  const orden: TSPPoint[] = []
  let current = start ?? remaining[0]
  // Si start no está en points, usamos el primero.
  if (!remaining.includes(current)) {
    current = remaining[0]
  }
  remaining.splice(remaining.indexOf(current), 1)
  orden.push(current)

  let totalDist = 0
  while (remaining.length > 0) {
    let nearestIdx = 0
    let nearestDist = haversineKm(current, remaining[0])
    for (let i = 1; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i])
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = i
      }
    }
    totalDist += nearestDist
    current = remaining[nearestIdx]
    remaining.splice(nearestIdx, 1)
    orden.push(current)
  }

  return { orden, distanciaKm: totalDist }
}

/**
 * 2-opt: intercambia 2 aristas adyacentes si la nueva ruta es más corta.
 * Repite hasta que no haya mejora.
 */
export function twoOpt(
  initial: TSPPoint[],
  maxIter = 100,
): { orden: TSPPoint[]; distanciaKm: number; iteraciones: number } {
  if (initial.length < 3) {
    return {
      orden: [...initial],
      distanciaKm: routeDistance(initial),
      iteraciones: 0,
    }
  }

  let best = [...initial]
  let bestDist = routeDistance(best)
  let iteraciones = 0
  let improved = true

  while (improved && iteraciones < maxIter) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        // 2-opt swap: invertir segmento [i..j]
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        const candDist = routeDistance(candidate)
        if (candDist < bestDist - 1e-9) {
          best = candidate
          bestDist = candDist
          improved = true
        }
      }
    }
    iteraciones++
  }

  return { orden: best, distanciaKm: bestDist, iteraciones }
}

/**
 * TSP combinado: nearest-neighbor para inicializar, 2-opt para mejorar.
 * Esta es la función que consume optimize-ruta.ts.
 */
export function optimizeRuta(
  points: TSPPoint[],
  start?: TSPPoint,
): { orden: TSPPoint[]; distanciaKm: number; iteraciones: number } {
  const nn = nearestNeighborOrder(points, start)
  return twoOpt(nn.orden)
}

export function routeDistance(points: TSPPoint[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    d += haversineKm(points[i - 1], points[i])
  }
  return d
}
