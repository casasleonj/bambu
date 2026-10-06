import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ZonaBarrioNoEncontradoError, quitarBarrioDeZona } from '@/lib/zonas/zona-service'

/**
 * DELETE /api/zonas/[id]/barrios/[barrioId]
 *
 * Quita un Barrio de una Zona (borrado físico del vínculo únicamente —
 * ni la Zona ni el Barrio se tocan). Si el Barrio sigue en otras Zonas,
 * esas relaciones no se ven afectadas (el service devuelve
 * `zonasRestantes` para la auditoría, no para la respuesta HTTP).
 *
 * Idempotente a nivel de identidad: si el vínculo no existe, 404.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; barrioId: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id: zonaId, barrioId } = await params
  const usuarioId = (authResult.user as { id?: string } | undefined)?.id ?? null

  try {
    await quitarBarrioDeZona(zonaId, barrioId, usuarioId)
    return apiSuccess({ ok: true })
  } catch (error) {
    if (error instanceof ZonaBarrioNoEncontradoError) {
      return apiError('Ese barrio no pertenece a esta zona', 404)
    }
    return apiError('Error quitando barrio de la zona')
  }
}
