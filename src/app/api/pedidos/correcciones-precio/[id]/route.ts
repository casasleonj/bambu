import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { ResolverCorreccionPrecioUseCase } from '@/modules/pedidos/application/use-cases/CorreccionPrecioUseCases'
import { mapCorreccionPrecioError } from '@/modules/pedidos/presentation/correccion-precio-http'

const ResolverSchema = z.object({
  resolucion: z.enum(['AUTORIZAR', 'RECHAZAR']),
  nota: z.string().max(500).optional(),
})

/** PATCH /api/pedidos/correcciones-precio/[id] — el ADMIN autoriza (aplica) o rechaza una solicitud. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const parsed = ResolverSchema.safeParse(await request.json())
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)

    const result = await new ResolverCorreccionPrecioUseCase().execute({
      correccionId: id,
      resolucion: parsed.data.resolucion,
      nota: parsed.data.nota,
      actorId: auth.user?.id ?? '',
      actorRol: auth.user?.role ?? '',
    })
    return apiSuccess(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    const conocido = mapCorreccionPrecioError(message)
    if (conocido) return apiError(conocido.message, conocido.status, conocido.code ? { code: conocido.code } : undefined)
    logger.error({ err: message }, 'Error resolviendo corrección de precio')
    return apiError('Error al resolver la corrección de precio', 500)
  }
}
