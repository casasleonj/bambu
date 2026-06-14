/**
 * Wrapper de DBSCAN sobre clientes con coordenadas.
 * Toma clientes con lat/lng, devuelve clusters + outliers.
 */

import { prisma } from '@/lib/prisma'
import { dbscan, type DBSCANPoint, type DBSCANResult } from './dbscan'

export interface ClusterPreviewOptions {
  epsKm?: number // default 1.5
  minPts?: number // default 3
  /** Limitar a clientes con pedidos pendientes. Default: true. */
  onlyWithPedidos?: boolean
}

export interface ClusterWithStats {
  id: number
  clienteIds: string[]
  centroide: { lat: number; lng: number }
  n: number
}

export interface ClusterPreviewResult {
  clusters: ClusterWithStats[]
  outliers: string[]
  totalClientes: number
  totalConCoords: number
  epsKm: number
  minPts: number
}

export async function previewClusters(
  opts: ClusterPreviewOptions = {},
): Promise<ClusterPreviewResult> {
  const epsKm = opts.epsKm ?? 1.5
  const minPts = opts.minPts ?? 3
  const onlyWithPedidos = opts.onlyWithPedidos ?? true

  const where: { lat: { not: null }; lng: { not: null }; activo: boolean; pedidos?: { some: object } } = {
    lat: { not: null },
    lng: { not: null },
    activo: true,
  }
  if (onlyWithPedidos) {
    where.pedidos = { some: { estado: { in: ['PENDIENTE', 'EN_RUTA'] } } }
  }

  const clientes = await prisma.cliente.findMany({
    where,
    select: { id: true, lat: true, lng: true },
  })

  const puntos: DBSCANPoint[] = clientes
    .filter(c => c.lat != null && c.lng != null)
    .map(c => ({
      id: c.id,
      lat: Number(c.lat),
      lng: Number(c.lng),
    }))

  const totalClientes = await prisma.cliente.count({ where: { activo: true } })

  if (puntos.length === 0) {
    return {
      clusters: [],
      outliers: [],
      totalClientes,
      totalConCoords: 0,
      epsKm,
      minPts,
    }
  }

  const r: DBSCANResult = dbscan(puntos, { epsKm, minPts })
  return {
    clusters: r.clusters.map(c => ({
      id: c.id,
      clienteIds: c.puntos.map(p => p.id),
      centroide: c.centroide,
      n: c.n,
    })),
    outliers: r.outliers.map(p => p.id),
    totalClientes,
    totalConCoords: puntos.length,
    epsKm,
    minPts,
  }
}
