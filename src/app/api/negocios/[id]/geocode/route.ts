/**
 * POST /api/negocios/[id]/geocode
 *
 * Recalcula y persiste las coordenadas del negocio usando la estrategia
 * de backfill (linkUbicacion → mediana GPS historial de pedidos ENTREGADOS).
 * Es idempotente.
 *
 * Auth: ADMIN, ASISTENTE (los mismos roles que pueden editar un negocio).
 * Rate limit: vía proxy.ts (es /api/*).
 */

import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import {
  backfillNegocioCoords,
  persistNegocioCoords,
} from '@/lib/geo/backfill-negocio-coords'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params

  try {
    const result = await backfillNegocioCoords(id)
    await persistNegocioCoords(id, result)

    await logAudit({
      entidad: 'Negocio',
      registroId: id,
      accion: 'UPDATE',
      datos: {
        campo: 'geocode',
        resultado: result,
        usuario: authResult.user?.id,
      },
    })

    return apiSuccess({
      negocioId: id,
      coords: result
        ? { lat: result.lat, lng: result.lng, origen: result.origen }
        : null,
      mensaje: result
        ? `Coords actualizadas desde ${result.origen}`
        : 'No se encontraron coords (link inválido o sin GPS historial)',
    })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown', negocioId: id },
      'Error en geocode de negocio:',
    )
    return apiError('Error al geocodificar negocio', 500)
  }
}
