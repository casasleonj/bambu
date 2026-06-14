/**
 * POST /api/clientes/[id]/geocode
 *
 * Recalcula y persiste las coordenadas del cliente usando la estrategia
 * de backfill (linkUbicacion → GPS historial → Negocio). Es idempotente.
 *
 * Auth: ADMIN, ASISTENTE (los mismos roles que pueden editar un cliente).
 * Rate limit: vía proxy.ts (es /api/*).
 */

import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import {
  backfillClienteCoords,
  persistClienteCoords,
} from '@/lib/geo/backfill-cliente-coords'

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
    const result = await backfillClienteCoords(id)
    await persistClienteCoords(id, result)

    await logAudit({
      entidad: 'Cliente',
      registroId: id,
      accion: 'UPDATE',
      datos: {
        campo: 'geocode',
        resultado: result,
        usuario: authResult.user?.id,
      },
    })

    return apiSuccess({
      clienteId: id,
      coords: result
        ? { lat: result.lat, lng: result.lng, origen: result.origen }
        : null,
      mensaje: result
        ? `Coords actualizadas desde ${result.origen}`
        : 'No se encontraron coords (link inválido, sin GPS, sin negocio)',
    })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown', clienteId: id },
      'Error en geocode de cliente:',
    )
    return apiError('Error al geocodificar cliente', 500)
  }
}
