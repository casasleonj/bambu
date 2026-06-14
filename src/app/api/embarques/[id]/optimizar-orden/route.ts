/**
 * POST /api/embarques/[id]/optimizar-orden
 *
 * Aplica TSP heurístico (NN + 2-opt) a los pedidos del embarque y
 * persiste el orden en `Embarque.ordenVisita` (JSON). El repartidor ve
 * los pedidos en este orden en /repartidor.
 *
 * Auth: REPARTIDOR, ADMIN, ASISTENTE.
 * Idempotente: si ya está optimizado, recalcula.
 *
 * Por qué Haversine (no OSRM): decisión Iter 0 confirmada con el
 * usuario. Suficiente para N≤25 stops por ruta.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireOwnership } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { optimizeEmbarqueOrden } from '@/lib/geo/optimize-ruta'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const session = authResult as { user?: { id?: string; role?: string } }
  const { id } = await params

  const hasAccess = await requireOwnership('embarque', id, {
    id: session.user?.id || '',
    role: session.user?.role || '',
  })
  if (!hasAccess) return apiError('Forbidden', 403)

  try {
    // El embarque debe existir y no estar cerrado
    const embarque = await prisma.embarque.findUnique({
      where: { id },
      select: { id: true, estado: true, rutaId: true },
    })
    if (!embarque) return apiError('Embarque no encontrado', 404)
    if (embarque.estado === 'CERRADO') {
      return apiError('No se puede optimizar un embarque cerrado', 409)
    }

    const result = await optimizeEmbarqueOrden(id)

    if (result.pedidoIds.length === 0) {
      return apiError(
        `No hay pedidos con coordenadas (${result.sinCoords.length} sin coords). Backfilleá las coords primero con POST /api/clientes/[id]/geocode.`,
        400,
      )
    }

    // Persistir
    await prisma.embarque.update({
      where: { id },
      data: {
        ordenVisita: {
          pedidoIds: result.pedidoIds,
          distanciaKm: result.distanciaKm,
          iteraciones: result.iteraciones,
          sinCoords: result.sinCoords,
          generadoEn: new Date().toISOString(),
        },
        optimizadoEn: new Date(),
      },
    })

    await logAudit({
      entidad: 'Embarque',
      registroId: id,
      accion: 'UPDATE',
      datos: {
        campo: 'ordenVisita',
        distanciaKm: result.distanciaKm,
        iteraciones: result.iteraciones,
        nPedidosOptimizados: result.pedidoIds.length,
        nSinCoords: result.sinCoords.length,
      },
    })

    return apiSuccess({
      embarqueId: id,
      ...result,
      mensaje: `Ruta optimizada: ${result.pedidoIds.length} pedidos, ${result.distanciaKm.toFixed(1)} km total (${result.iteraciones} iter 2-opt)`,
    })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown', embarqueId: id },
      'Error optimizando embarque:',
    )
    return apiError('Error al optimizar ruta del embarque', 500)
  }
}

/** GET: devuelve el orden optimizado actual (si existe). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params

  const embarque = await prisma.embarque.findUnique({
    where: { id },
    select: { id: true, ordenVisita: true, optimizadoEn: true },
  })
  if (!embarque) return apiError('Embarque no encontrado', 404)
  return apiSuccess({
    embarqueId: id,
    ordenVisita: embarque.ordenVisita,
    optimizadoEn: embarque.optimizadoEn,
  })
}
