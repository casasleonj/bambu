import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { solicitarExcepcionCreditoUseCase } from '@/modules/pedidos'
import { ExcepcionNoNecesariaError } from '@/modules/pedidos/application/use-cases/SolicitarExcepcionCreditoUseCase'
import { ClienteNotFoundError } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'

const SolicitarExcepcionCreditoSchema = z.object({
  clienteId: z.string().trim().min(1),
  motivoSolicitud: z.string().trim().min(1),
  notaSolicitud: z.string().optional(),
  operacion: z.object({
    total: z.number().min(0),
    totalPagado: z.number().min(0),
  }),
  offlineId: z.string().optional(),
})

/**
 * POST /api/pedidos/excepciones-credito — F2 (Excepciones de Crédito).
 * Crea una solicitud PENDIENTE para UNA operación concreta. Mismos roles
 * que pueden crear pedidos (ADMIN/ASISTENTE) o venta libre (+ REPARTIDOR).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], auth)
  if (role instanceof Response) return role
  const actorId = role.user?.id
  if (!actorId) return apiError('No autorizado', 401)

  try {
    const body = await request.json()
    const parsed = SolicitarExcepcionCreditoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const result = await solicitarExcepcionCreditoUseCase.execute({
      clienteId: parsed.data.clienteId,
      motivoSolicitud: parsed.data.motivoSolicitud,
      notaSolicitud: parsed.data.notaSolicitud,
      solicitadoPorId: actorId,
      operacion: parsed.data.operacion,
      offlineId: parsed.data.offlineId,
    })

    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof ClienteNotFoundError) return apiError('Cliente no encontrado', 404)
    if (error instanceof ExcepcionNoNecesariaError) {
      return apiError('El cliente no está sobre el límite de fiados para esta operación', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error solicitando excepción de crédito')
    return apiError('Error solicitando la excepción de crédito', 500)
  }
}
