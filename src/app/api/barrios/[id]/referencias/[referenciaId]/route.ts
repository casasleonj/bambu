import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ReferenciaNoEncontradaError, eliminarReferencia } from '@/lib/barrios/referencia-service'

/**
 * DELETE /api/barrios/[id]/referencias/[referenciaId]
 *
 * `[id]` cruza pertenencia — si la referencia existe pero pertenece a otro
 * Barrio, 404 (no leak info, mismo patrón que ContactoCliente).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; referenciaId: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id: barrioId, referenciaId } = await params
  const usuarioId = (authResult.user as { id?: string } | undefined)?.id

  if (!usuarioId) return apiError('Sesión inválida', 401)

  try {
    await eliminarReferencia(barrioId, referenciaId, usuarioId)
    return apiSuccess({ ok: true })
  } catch (error) {
    if (error instanceof ReferenciaNoEncontradaError) {
      return apiError('Referencia no encontrada', 404)
    }
    return apiError('Error eliminando la referencia')
  }
}
