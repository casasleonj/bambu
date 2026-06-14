// @tests dbscan — Bloque 2 (clustering)

import { describe, it, expect } from 'vitest'
import { dbscan, type DBSCANPoint } from '../dbscan'

function p(lat: number, lng: number, id = `${lat},${lng}`): DBSCANPoint {
  return { id, lat, lng }
}

describe('dbscan', () => {
  it('all points noise si minPts no se alcanza', () => {
    const points = [p(4.6, -74.0), p(4.7, -74.1), p(4.8, -74.2)]
    // 1km entre puntos, eps=0.5km, minPts=3 → ninguno es core → todo noise
    const r = dbscan(points, { epsKm: 0.5, minPts: 3 })
    expect(r.clusters.length).toBe(0)
    expect(r.outliers.length).toBe(3)
  })

  it('cluster simple: 4 puntos cercanos → 1 cluster, 0 outliers', () => {
    const points = [p(4.6, -74.0), p(4.6, -74.01), p(4.61, -74.0), p(4.6, -74.005)]
    // ~1km entre puntos (al ecuador 0.01° ≈ 1.1km). eps=2km los cubre.
    const r = dbscan(points, { epsKm: 2, minPts: 3 })
    expect(r.clusters.length).toBe(1)
    expect(r.clusters[0].n).toBe(4)
    expect(r.outliers.length).toBe(0)
  })

  it('dos clusters separados + outliers', () => {
    // Cluster A: 3 puntos en Bogotá
    const a = [p(4.6, -74.0), p(4.61, -74.0), p(4.6, -74.01)]
    // Cluster B: 3 puntos en Medellín (~250km de A)
    const b = [p(6.2, -75.5), p(6.21, -75.5), p(6.2, -75.51)]
    // Outlier: Cali (a mitad de camino, no está en A ni B)
    const c = [p(3.4, -76.5)]
    const r = dbscan([...a, ...b, ...c], { epsKm: 5, minPts: 3 })
    expect(r.clusters.length).toBe(2)
    expect(r.outliers.length).toBe(1)
  })

  it('input vacío → 0 clusters, 0 outliers', () => {
    const r = dbscan([], { epsKm: 1, minPts: 2 })
    expect(r.clusters.length).toBe(0)
    expect(r.outliers.length).toBe(0)
  })

  it('input con 1 punto → 0 clusters (no es core), 1 outlier', () => {
    const r = dbscan([p(4.6, -74.0)], { epsKm: 1, minPts: 2 })
    expect(r.clusters.length).toBe(0)
    expect(r.outliers.length).toBe(1)
  })

  it('ordenamiento: clusters más grandes primero', () => {
    // 3 puntos en A, 5 en B. B debería aparecer primero.
    const a = [p(4.6, -74.0), p(4.6, -74.01), p(4.61, -74.0)]
    const b = [p(4.7, -74.1), p(4.7, -74.11), p(4.71, -74.1), p(4.7, -74.12), p(4.71, -74.11)]
    const r = dbscan([...a, ...b], { epsKm: 5, minPts: 3 })
    expect(r.clusters.length).toBe(2)
    expect(r.clusters[0].n).toBe(5)
    expect(r.clusters[1].n).toBe(3)
  })

  it('centroid se computa correctamente', () => {
    const points = [p(0, 0, 'a'), p(0, 2, 'b'), p(2, 0, 'c')]
    const r = dbscan(points, { epsKm: 1000, minPts: 3 })
    expect(r.clusters[0].centroide.lat).toBeCloseTo(0.667, 2)
    expect(r.clusters[0].centroide.lng).toBeCloseTo(0.667, 2)
  })

  it('shape arbitraria: cluster en forma de L', () => {
    // 6 puntos en L (en coords de Bogotá, deltas de 0.01° ≈ 1.1km).
    // (4.60,-74.00) → (4.60,-74.01) → (4.60,-74.02) → (4.61,-74.02) → (4.62,-74.02) → (4.62,-74.03)
    // Cada par adyacente a ~1.1km. epsKm=2 los cubre.
    const points = [
      p(4.60, -74.00), p(4.60, -74.01), p(4.60, -74.02),
      p(4.61, -74.02), p(4.62, -74.02), p(4.62, -74.03),
    ]
    const r = dbscan(points, { epsKm: 2, minPts: 2 })
    expect(r.clusters.length).toBe(1)
    expect(r.clusters[0].n).toBe(6)
  })

  it('rechaza epsKm <= 0', () => {
    expect(() => dbscan([p(0, 0)], { epsKm: 0, minPts: 2 })).toThrow()
    expect(() => dbscan([p(0, 0)], { epsKm: -1, minPts: 2 })).toThrow()
  })

  it('rechaza minPts < 1', () => {
    expect(() => dbscan([p(0, 0)], { epsKm: 1, minPts: 0 })).toThrow()
  })
})
