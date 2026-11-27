/**
 * TSP heurístico: Nearest-Neighbor + 2-opt.
 *
 * Por qué no OSRM / VROOM (decisión de Iter 0, confirmada con el usuario):
 *  - $0/mes, sin Docker, sin VPS, sin internet.
 *  - Suficiente para 1-25 stops por ruta (caso actual).
 *  - Es una aproximación geométrica, NO una estimación por calles.
 *    Para el modo Cercanía de Pedidos se utiliza el proveedor vial #930.
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
  const remaining = [...points]
  const orden: TSPPoint[] = []
  let current: TSPPoint
  if (start) {
    const startIndex = remaining.findIndex(p => p.id === start.id)
    if (startIndex >= 0) {
      // Si el origen es una visita, se conserva como primera parada.
      current = remaining.splice(startIndex, 1)[0]
      orden.push(current)
    } else {
      // Origen externo (p. ej. planta San José): NO es pedido ni parada.
      current = start
    }
  } else {
    // Compatibilidad con consumidores que no envían punto de partida.
    current = remaining.shift()!
    orden.push(current)
  }

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
  start?: TSPPoint,
): { orden: TSPPoint[]; distanciaKm: number; iteraciones: number } {
  // Sin origen externo, preservar el contrato histórico para 1–2 puntos.
  // Con dos paradas y origen externo puede convenir intercambiarlas.
  const puedeMejorarDos = initial.length === 2 && start !== undefined &&
    start.id !== initial[0].id && start.id !== initial[1].id
  if (initial.length < 3 && !puedeMejorarDos) {
    return {
      orden: [...initial],
      distanciaKm: routeDistance(initial, start),
      iteraciones: 0,
    }
  }

  let best = [...initial]
  let bestDist = routeDistance(best, start)
  let iteraciones = 0
  let improved = true
  const lockedStart = start !== undefined && best[0].id === start.id

  while (improved && iteraciones < maxIter) {
    improved = false
    for (let i = lockedStart ? 1 : 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        // 2-opt swap: invertir segmento [i..j]
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        const candDist = routeDistance(candidate, start)
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
  return twoOpt(nn.orden, 100, start)
}

export function routeDistance(points: TSPPoint[], start?: TSPPoint): number {
  if (points.length === 0) return 0
  // El costo incluye planta→primera parada cuando la planta es externa.
  let d = start && start.id !== points[0].id ? haversineKm(start, points[0]) : 0
  for (let i = 1; i < points.length; i++) {
    d += haversineKm(points[i - 1], points[i])
  }
  return d
}
