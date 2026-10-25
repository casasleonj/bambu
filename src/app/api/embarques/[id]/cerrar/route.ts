/**
 * Cerrar Embarque API Route — Thin Controller.
 *
 * Formerly 582 lines of business logic.
 * Now delegates entirely to CerrarEmbarqueUseCase.
 */

import { NextRequest } from 'next/server'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { formatZodError } from '@/lib/utils'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { CerrarEmbarqueSchema } from '@/lib/validators'

// DDD imports
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { CierrePresenter } from '@/modules/embarques/presentation/CierrePresenter'
import { mapCierreError, toCerrarInput } from '@/modules/embarques/presentation/cierre-http'
import { publishRealtimeEvent } from '@/lib/realtime'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { NotificationEventType } from '@/lib/notifications/event-types'

// Infrastructure dependencies
const embarqueRepo = new PrismaEmbarqueRepository()
const gastoRepo = new PrismaGastoEmbarqueRepository()
const productoRepo = new PrismaEmbarqueProductoRepository()
const txManager = new PrismaTransactionManager()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  try {
    const body = await request.json()
    const parsed = CerrarEmbarqueSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    // Map legacy DTO to DDD input (compartido con el preview: mismo mapeo exacto)
    const useCase = new CerrarEmbarqueUseCase(
      embarqueRepo,
      gastoRepo,
      productoRepo,
      txManager,
      session.user?.id,
      session.user?.role,
    )

    const result = await useCase.execute(toCerrarInput(id, parsed.data, { offlineId: parsed.data.offlineId }))

    // Convert to legacy response shape for backward compatibility
    const legacyResponse = CierrePresenter.toLegacyResponse(result)

    // BAMBU-LOG-006: en un replay deduplicado (offline-first retry de un
    // cierre que ya se aplicó), no re-emitir realtime/push — el cierre
    // real ya los disparó la primera vez. Evita notificaciones
    // duplicadas a los admins en cada reintento de sync.
    if (!result.deduped) {
      publishRealtimeEvent('embarque.updated', id).catch(() => {})
      const { prisma } = await import('@/lib/prisma')
      prisma.embarque.findUnique({
        where: { id },
        include: { pedidos: { select: { id: true } } },
      }).then((embarque) => {
        embarque?.pedidos.forEach((p) => {
          publishRealtimeEvent('pedido.updated', p.id).catch(() => {})
        })
      }).catch(() => {})

      // Push notification to admins (replaces SSE for off-tab users).
      void notifyEvent(NotificationEventType.EMBARQUE_CERRADO, {
        title: 'Embarque cerrado',
        body: `Un embarque fue cerrado. Revisá la caja.`,
        url: `/embarques?openEmbarque=${id}`,
        tag: `embarque-cerrado-${id}`,
      })
    }

    return apiSuccess(legacyResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: message }, 'Error cerrando embarque:')

    const conocido = mapCierreError(message)
    if (conocido) {
      return apiError(conocido.message, conocido.status, conocido.code ? { code: conocido.code } : undefined)
    }

    return apiError('Error al cerrar embarque', 500)
  }
}
