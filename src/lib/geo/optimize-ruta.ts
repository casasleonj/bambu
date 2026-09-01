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
import { pickCoords } from './pedido-coords'

export interface OptimizeResult {
  pedidoIds: string[]
  distanciaKm: number
  iteraciones: number
  sinCoords: string[]
}

export async function optimizeEmbarqueOrden(embarqueId: string): Promise<OptimizeResult> {
  const pedidos = await prisma.pedido.findMany({
    where: { embarqueId, estadoEntrega: { in: ['PENDIENTE', 'EN_RUTA'] } },
    select: {
      id: true,
      cliente: { select: { lat: true, lng: true } },
      negocio: { select: { lat: true, lng: true } },
    },
    orderBy: { numero: 'asc' },
  })

  const sinCoords: string[] = []
  const puntos: TSPPoint[] = []

  for (const p of pedidos) {
    // Coords efectivas: negocio gana, fallback a cliente (schema.prisma contrato).
    const coords = pickCoords(p)
    if (coords) {
      puntos.push({ id: p.id, lat: coords.lat, lng: coords.lng })
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
