/**
 * POST /api/push/subscribe
 *
 * Registra la suscripcion Web Push del navegador del usuario.
 * Llamado por el Service Worker (Serwist) despues de que el usuario
 * otorga permiso de notificacion.
 *
 * Body esperado (formato W3C Web Push):
 *   {
 *     endpoint: 'https://fcm.googleapis.com/...',
 *     keys: { p256dh: '...', auth: '...' }
 *   }
 *
 * - Si la subscription ya existe (mismo endpoint), actualiza p256dh/auth/userAgent.
 *   Esto cubre el caso de browser rotation de endpoints (chrome rota cada ~mes).
 * - El userId se obtiene de la sesion (no del body) — seguridad.
 *
 * Auth: requireAuth.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

const SubscribeBodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export async function POST(request: NextRequest) {
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

  const parsed = SubscribeBodySchema.safeParse(body)
  if (!parsed.success) {
    return apiError(formatZodError(parsed.error), 400)
  }

  const { endpoint, keys } = parsed.data
  const userAgent = request.headers.get('user-agent') || null

  try {
    // Upsert: si el endpoint ya existe, actualiza p256dh/auth/userAgent/userId.
    // Esto cubre el caso donde el mismo browser/device rota el endpoint.
    // NOTA: Prisma no soporta upsert con where != unique. Usamos
    // findFirst + create/update.
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    })

    if (existing) {
      const updated = await prisma.pushSubscription.update({
        where: { endpoint },
        data: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent,
          userId, // Re-asignar por si el endpoint cambio de usuario (otro device)
          lastSeenAt: new Date(),
        },
      })
      return apiSuccess({ subscription: { id: updated.id } })
    }

    const created = await prisma.pushSubscription.create({
      data: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    })

    logAudit({
      entidad: 'PushSubscription',
      registroId: created.id,
      accion: 'CREATE',
      datos: { endpoint: endpoint.slice(0, 60) },
      usuarioId: userId,
    }).catch(() => {})

    return apiSuccess({ subscription: { id: created.id } }, 201)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown'
    return apiError(`Error registrando suscripcion: ${errMsg}`, 500)
  }
}
