/**
 * DBSCAN — Density-Based Spatial Clustering of Applications with Noise.
 *
 * Paper: Ester, Kriegel, Sander, Xu (1996). Test of Time Award SIGKDD 2014.
 *
 * Parámetros:
 *  - eps: radio de vecindad en km (default 1.5 km, ajustable por admin)
 *  - minPts: mínimo de vecinos para que un punto sea "core" (default 3)
 *
 * Por qué DBSCAN y no k-means:
 *  - No requiere decir "k" (= número de rutas). El admin no sabe
 *    cuántos clusters van a salir hasta que corre el algoritmo.
 *  - Detecta outliers (clientes aislados) sin asignarlos a un cluster
 *    forzado. Esos quedan en `outliers` y el admin los asigna manual.
 *  - Forma arbitraria: si los clientes están en L o anillo, k-means
 *    falla, DBSCAN lo clava.
 *
 * Ver: https://en.wikipedia.org/wiki/DBSCAN
 */

import { haversineKm, type LatLng } from './haversine'

export interface DBSCANPoint extends LatLng {
  id: string
}

export interface DBSCANResult {
  clusters: Array<{
    id: number
    puntos: DBSCANPoint[]
    centroide: LatLng
    n: number
  }>
  outliers: DBSCANPoint[]
}

export interface DBSCANOptions {
  epsKm: number
  minPts: number
}

export function dbscan(points: DBSCANPoint[], opts: DBSCANOptions): DBSCANResult {
  const { epsKm, minPts } = opts
  if (epsKm <= 0) throw new Error('epsKm must be > 0')
  if (minPts < 1) throw new Error('minPts must be >= 1')

  const n = points.length
  const labels: number[] = new Array(n).fill(-2) // -2 = undefined, -1 = noise, >=0 = cluster id
  const visited: boolean[] = new Array(n).fill(false)

  const rangeQuery = (i: number): number[] => {
    const result: number[] = []
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      if (haversineKm(points[i], points[j]) <= epsKm) {
        result.push(j)
      }
    }
    return result
  }

  let clusterId = 0

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue
    visited[i] = true
    const neighbors = rangeQuery(i)

    if (neighbors.length < minPts - 1) {
      // No es core. Por ahora marcar como noise; puede ser reclasificado
      // como border si después aparece como vecino de un core.
      labels[i] = -1
    } else {
      // Es core. Inicia nuevo cluster.
      labels[i] = clusterId
      const seedSet = [...neighbors]

      for (let k = 0; k < seedSet.length; k++) {
        const q = seedSet[k]
        if (!visited[q]) {
          visited[q] = true
          const qNeighbors = rangeQuery(q)
          if (qNeighbors.length >= minPts - 1) {
            // q es core → expandimos el cluster
            for (const nq of qNeighbors) {
              if (!seedSet.includes(nq)) seedSet.push(nq)
            }
          }
        }
        if (labels[q] === -1 || labels[q] === -2) {
          labels[q] = clusterId
        }
      }

      clusterId++
    }
  }

  // Construir resultado
  const clusterMap = new Map<number, DBSCANPoint[]>()
  const outliers: DBSCANPoint[] = []
  for (let i = 0; i < n; i++) {
    if (labels[i] >= 0) {
      if (!clusterMap.has(labels[i])) clusterMap.set(labels[i], [])
      clusterMap.get(labels[i])!.push(points[i])
    } else {
      outliers.push(points[i])
    }
  }

  const clusters = Array.from(clusterMap.entries())
    .map(([id, puntos]) => ({
      id,
      puntos,
      n: puntos.length,
      centroide: computeCentroid(puntos),
    }))
    .sort((a, b) => b.n - a.n) // más grandes primero

  return { clusters, outliers }
}

function computeCentroid(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 }
  let lat = 0
  let lng = 0
  for (const p of points) {
    lat += p.lat
    lng += p.lng
  }
  return { lat: lat / points.length, lng: lng / points.length }
}
