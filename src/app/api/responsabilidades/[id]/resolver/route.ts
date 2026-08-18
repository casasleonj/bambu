import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { ResolverResponsibilityCaseUseCase } from '@/modules/embarques/application/use-cases/ResolverResponsibilityCaseUseCase'

const ResolverSchema = z.object({
  resolucion: z.enum(['SIN_CARGO', 'CON_CARGO']),
  autorizadoPorId: z.string().optional(),
  motivo: z.string().optional(),
})

/**
 * POST /api/responsabilidades/[id]/resolver — resuelve un caso de
 * responsabilidad (contrato §13). RESUELTA_CON_CARGO exige autorizadoPorId +
 * resueltoPorId; el cargo económico solo se materializa con ambos.
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
    const parsed = ResolverSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new ResolverResponsibilityCaseUseCase()
    const result = await useCase.execute({
      caseId: id,
      resolucion: parsed.data.resolucion,
      resueltoPorId: auth.user?.id ?? '',
      autorizadoPorId: parsed.data.autorizadoPorId,
      motivo: parsed.data.motivo,
    })

    return apiSuccess(result, result.deduped ? 200 : 200)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'RESPONSIBILITY_CASE_NOT_FOUND') return apiError('Caso de responsabilidad no encontrado', 404)
      if (error.message === 'RESUELTA_CON_CARGO_EXIGE_AUTORIZACION') return apiError('El cargo exige autorizadoPorId', 403)
      if (error.message === 'RESUELTA_CON_CARGO_EXIGE_RESOLUTOR') return apiError('El cargo exige resueltoPorId', 403)
      if (error.message === 'RESPONSIBILITY_CASE_SIN_TRABAJADOR') return apiError('El caso no tiene trabajador asignado', 400)
      if (error.message === 'DESCUENTO_EXIGE_EMBARQUE') return apiError('El descuento exige embarque asociado', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error resolviendo responsabilidad')
    return apiError('Error resolviendo responsabilidad', 500)
  }
}
