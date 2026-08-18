import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { AsignarActividadUseCase } from '@/modules/embarques/application/use-cases/AsignarActividadUseCase'

const AsignarSchema = z.object({
  producto: z.string().min(1),
  cantidad: z.number().int().positive(),
  embarqueId: z.string().optional(),
  tipo: z.enum(['ENTREGA', 'RECOGIDA_BOTELLON', 'COBRO']).optional(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/obligaciones/[id]/asignar — compromete unidades de una obligación a
 * una Actividad (contrato §7), bajo lock OBLIGACION:{obligacionId}. Nunca
 * sobre-consumir (invariante cumplida+asignada <= original).
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
    const parsed = AsignarSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new AsignarActividadUseCase()
    const result = await useCase.execute({
      obligacionId: id,
      producto: parsed.data.producto,
      cantidad: parsed.data.cantidad,
      embarqueId: parsed.data.embarqueId,
      tipo: parsed.data.tipo,
      offlineId: parsed.data.offlineId,
    })

    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'OBLIGACION_NOT_FOUND') return apiError('Obligación no encontrada', 404)
      if (error.message.includes('SOBRECONSUMO')) return apiError(error.message, 409)
      if (error.message.includes('cantidad')) return apiError(error.message, 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error asignando actividad')
    return apiError('Error asignando actividad', 500)
  }
}
