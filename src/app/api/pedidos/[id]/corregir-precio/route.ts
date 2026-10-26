import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { SolicitarCorreccionPrecioUseCase } from '@/modules/pedidos/application/use-cases/CorreccionPrecioUseCases'
import { mapCorreccionPrecioError } from '@/modules/pedidos/presentation/correccion-precio-http'

const CorregirPrecioSchema = z.object({
  producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']),
  precioNuevo: z.number().positive().max(99_999_999),
  motivo: z.string().max(500),
  offlineId: z.string().optional(),
})

/**
 * POST /api/pedidos/[id]/corregir-precio — corrige el precio de una línea con recálculo
 * (ADR-MONETARIO-002 §1). ADMIN aplica en el acto; ASISTENTE deja una solicitud PENDIENTE
 * que un ADMIN resuelve en PATCH /api/pedidos/correcciones-precio/[id].
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = CorregirPrecioSchema.safeParse(body)
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)

    const result = await new SolicitarCorreccionPrecioUseCase().execute({
      pedidoId: id,
      producto: parsed.data.producto,
      precioNuevo: parsed.data.precioNuevo,
      motivo: parsed.data.motivo,
      actorId: auth.user?.id ?? '',
      actorRol: auth.user?.role ?? '',
      offlineId: parsed.data.offlineId,
    })
    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    const conocido = mapCorreccionPrecioError(message)
    if (conocido) return apiError(conocido.message, conocido.status, conocido.code ? { code: conocido.code } : undefined)
    logger.error({ err: message }, 'Error corrigiendo precio')
    return apiError('Error al corregir el precio', 500)
  }
}
