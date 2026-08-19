import { z } from 'zod'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { CrearRecoveryDecisionUseCase } from '@/modules/embarques/application/use-cases/CrearRecoveryDecisionUseCase'

/**
 * GET /api/embarques/[id]/recovery — lista las RecoveryDecision del embarque
 * (contrato §3/§4), más reciente primero. Mismo control de acceso que
 * GET /api/embarques/[id].
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  try {
    const recovery = await prisma.recoveryDecision.findMany({
      where: { embarqueId: id },
      include: {
        sourceEvent: { select: { id: true, tipo: true, producto: true, cantidad: true, createdAt: true } },
        pedidoOrigen: { select: { id: true, numero: true } },
        pedidoDestino: { select: { id: true, numero: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return apiSuccess({ recovery })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error listando recovery decisions')
    return apiError('Error listando recovery decisions', 500)
  }
}

const RecoverySchema = z.object({
  tipo: z.enum(['SOBRANTE', 'FALTANTE']),
  sourceEventId: z.string().optional(),
  producto: z.string().min(1),
  cantidad: z.number().int().positive(),
  cantidadAplicada: z.number().int().min(0),
  reason: z.string().min(1),
  pedidoOrigenId: z.string().optional(),
  pedidoDestinoId: z.string().optional(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/embarques/[id]/recovery — crea una RecoveryDecision (contrato §3/§4).
 * SOBRANTE exige sourceEventId y valida sin doble consumo; FALTANTE no inventa
 * evento físico de origen.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = RecoverySchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new CrearRecoveryDecisionUseCase()
    const result = await useCase.execute({
      embarqueId: id,
      tipo: parsed.data.tipo,
      sourceEventId: parsed.data.sourceEventId,
      producto: parsed.data.producto,
      cantidad: parsed.data.cantidad,
      cantidadAplicada: parsed.data.cantidadAplicada,
      actorId: auth.user?.id ?? 'unknown',
      authorizedById: auth.user?.id ?? undefined,
      reason: parsed.data.reason,
      pedidoOrigenId: parsed.data.pedidoOrigenId,
      pedidoDestinoId: parsed.data.pedidoDestinoId,
      offlineId: parsed.data.offlineId,
    })

    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'SOURCE_EVENT_NOT_FOUND') return apiError('Movimiento de origen no encontrado', 404)
      if (error.message.startsWith('DOBLE_CONSUMO')) return apiError(error.message, 409)
      if (error.message.includes('SOBRANTE') || error.message.includes('FALTANTE') || error.message.includes('cantidad'))
        return apiError(error.message, 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creando recovery')
    return apiError('Error creando recovery', 500)
  }
}
