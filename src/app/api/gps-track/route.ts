import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { GpsTrackCreateSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleResult = await requireRole([ROLES.REPARTIDOR, ROLES.ADMIN], authResult)
  if (roleResult instanceof Response) return roleResult

  const user = (authResult as { user?: { id?: string; role?: string } }).user

  try {
    const body = await request.json()
    const parsed = GpsTrackCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { embarqueId, lat, lng, accuracy, timestamp, offlineId } = parsed.data

    const embarque = await prisma.embarque.findUnique({
      where: { id: embarqueId },
      select: { id: true, trabajadorId: true, trabajador: { select: { userId: true } } },
    })

    if (!embarque) {
      return apiError('Embarque no encontrado', 404)
    }

    // REPARTIDOR solo puede registrar GPS en sus propios embarques.
    // ADMIN puede registrar GPS para cualquier embarque (auditoría/soporte).
    if (user?.role === ROLES.REPARTIDOR && embarque.trabajador.userId !== user.id) {
      return apiError('No tiene permisos para registrar GPS en este embarque', 403)
    }

    const track = await prisma.gpsTrack.create({
      data: {
        embarqueId,
        trabajadorId: embarque.trabajadorId,
        lat,
        lng,
        accuracy: accuracy ?? null,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        synced: true,
      },
    })

    logAudit({
      entidad: 'GpsTrack',
      registroId: track.id,
      accion: 'CREATE',
      datos: { embarqueId, lat, lng, accuracy, offlineId },
      usuarioId: user?.id,
    })

    return apiSuccess({ track }, 201)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return apiError('Body JSON inválido', 400)
    }
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown', userId: user?.id },
      'Error creando GpsTrack',
    )
    return apiError('Error registrando ubicación GPS')
  }
}
