import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { ResolverReduccionComercialUseCase } from '@/modules/pedidos/application/use-cases/ReduccionComercialUseCases'
import { mapReduccionComercialError } from '@/modules/pedidos/presentation/reduccion-comercial-http'

const ResolverSchema = z.object({
  resolucion: z.enum(['AUTORIZAR', 'RECHAZAR']),
  nota: z.string().max(500).optional(),
})

/** PATCH /api/pedidos/reducciones-comerciales/[id] — quien tiene el permiso autoriza (aplica) o rechaza una solicitud. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const parsed = ResolverSchema.safeParse(await request.json())
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)

    const result = await new ResolverReduccionComercialUseCase().execute({
      reduccionId: id,
      resolucion: parsed.data.resolucion,
      nota: parsed.data.nota,
      actorId: auth.user?.id ?? '',
    })
    return apiSuccess(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    const conocido = mapReduccionComercialError(message)
    if (conocido) return apiError(conocido.message, conocido.status, conocido.code ? { code: conocido.code } : undefined)
    logger.error({ err: message }, 'Error resolviendo reducción comercial')
    return apiError('Error al resolver la reducción del pedido', 500)
  }
}
