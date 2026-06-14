/**
 * Wrapper: aplica TSP heurístico (NN + 2-opt) a los pedidos de un embarque.
 *
 * Output: { pedidoIds: [...], distanciaKm, iteraciones, sinCoords: [...] }
 *   - sinCoords: pedidos que no tienen lat/lng (no se pueden optimizar).
 *
 * Si todos los pedidos tienen coords → devuelve el orden optimizado.
 * Si hay mezcla → los sin-coords quedan fuera del orden (el admin los
 *   debe asignar manualmente o backfillearlos primero).
 */

import { prisma } from '@/lib/prisma'
import { optimizeRuta, type TSPPoint } from './tsp'

export interface OptimizeResult {
  pedidoIds: string[]
  distanciaKm: number
  iteraciones: number
  sinCoords: string[]
}

export async function optimizeEmbarqueOrden(embarqueId: string): Promise<OptimizeResult> {
  const pedidos = await prisma.pedido.findMany({
    where: { embarqueId, estado: { in: ['PENDIENTE', 'EN_RUTA'] } },
    select: {
      id: true,
      cliente: { select: { lat: true, lng: true } },
    },
    orderBy: { numero: 'asc' },
  })

  const sinCoords: string[] = []
  const puntos: TSPPoint[] = []

  for (const p of pedidos) {
    const lat = p.cliente?.lat != null ? Number(p.cliente.lat) : null
    const lng = p.cliente?.lng != null ? Number(p.cliente.lng) : null
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      puntos.push({ id: p.id, lat, lng })
    } else {
      sinCoords.push(p.id)
    }
  }

  if (puntos.length === 0) {
    return { pedidoIds: [], distanciaKm: 0, iteraciones: 0, sinCoords }
  }

  const r = optimizeRuta(puntos)
  return {
    pedidoIds: r.orden.map(p => p.id),
    distanciaKm: r.distanciaKm,
    iteraciones: r.iteraciones,
    sinCoords,
  }
}
