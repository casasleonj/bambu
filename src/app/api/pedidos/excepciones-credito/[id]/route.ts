import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { resolverExcepcionCreditoUseCase } from '@/modules/pedidos'
import { ExcepcionCreditoNotFoundError } from '@/modules/pedidos/application/use-cases/ResolverExcepcionCreditoUseCase'

/**
 * GET /api/pedidos/excepciones-credito/[id] — detalle de una solicitud
 * (snapshot al solicitar + resolución si ya la tiene). Mismos roles que
 * pueden ver/crear pedidos.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], auth)
  if (role instanceof Response) return role
  const { id } = await params

  const excepcion = await prisma.pedidoExcepcionCredito.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nombre: true, telefono: true } },
      solicitadoPor: { select: { id: true, nombre: true } },
      autorizadoPor: { select: { id: true, nombre: true } },
      rechazadoPor: { select: { id: true, nombre: true } },
    },
  })
  if (!excepcion) return apiError('Excepción de crédito no encontrada', 404)

  return apiSuccess({
    excepcion: {
      ...excepcion,
      saldoFiadoSnapshot: Number(excepcion.saldoFiadoSnapshot),
      operacionSaldoSnapshot: Number(excepcion.operacionSaldoSnapshot),
      saldoDespuesSnapshot: Number(excepcion.saldoDespuesSnapshot),
    },
  })
}

const ResolverExcepcionCreditoSchema = z.object({
  resolucion: z.enum(['AUTORIZAR', 'RECHAZAR']),
  nota: z.string().optional(),
})

/**
 * PATCH /api/pedidos/excepciones-credito/[id] — resuelve una solicitud.
 * Permiso EXPLÍCITAMENTE por usuario (`User.puedeAutorizarExcepcionCredito`),
 * no por rol (decisión del equipo: "ser ADMIN no debe ser la única
 * definición de autoridad", Plan Maestro §11).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const actorId = auth.user?.id
  if (!actorId) return apiError('No autorizado', 401)

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { puedeAutorizarExcepcionCredito: true },
  })
  if (!actor?.puedeAutorizarExcepcionCredito) {
    return apiError('No tienes autorización para resolver excepciones de crédito', 403)
  }

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = ResolverExcepcionCreditoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const result = await resolverExcepcionCreditoUseCase.execute({
      excepcionId: id,
      resolucion: parsed.data.resolucion,
      actorId,
      nota: parsed.data.nota,
    })

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof ExcepcionCreditoNotFoundError) return apiError('Excepción de crédito no encontrada', 404)
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error resolviendo excepción de crédito')
    return apiError('Error resolviendo la excepción de crédito', 500)
  }
}
