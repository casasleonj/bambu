/**
 * DELETE /api/push/unsubscribe
 *
 * Elimina la suscripcion Web Push del usuario actual.
 * Llamado por el Service Worker cuando el usuario revoca el permiso
 * de notificacion o cierra la sesion.
 *
 * Body esperado:
 *   { endpoint: 'https://...' }
 *
 * Auth: requireAuth. El userId se obtiene de la sesion.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

const UnsubscribeBodySchema = z.object({
  endpoint: z.string().url(),
})

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('No autorizado', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('Body invalido', 400)
  }

  const parsed = UnsubscribeBodySchema.safeParse(body)
  if (!parsed.success) {
    return apiError(formatZodError(parsed.error), 400)
  }

  const { endpoint } = parsed.data

  try {
    // Solo borramos si el endpoint pertenece al userId de la sesion.
    // Esto evita que un user borre la suscripcion de otro (defense in depth).
    const result = await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    })

    if (result.count > 0) {
      logAudit({
        entidad: 'PushSubscription',
        registroId: endpoint.slice(0, 60),
        accion: 'DELETE',
        datos: { endpoint: endpoint.slice(0, 60) },
        usuarioId: userId,
      }).catch(() => {})
    }

    return apiSuccess({ deleted: result.count })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown'
    return apiError(`Error eliminando suscripcion: ${errMsg}`, 500)
  }
}
