import { NextRequest } from 'next/server'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { BarrioAliasCreateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { BarrioNoEncontradoError } from '@/lib/barrios/barrio-service'
import { ConflictoTerritorialError, ReferenciaRedundanteError, crearAlias } from '@/lib/barrios/referencia-service'
import { ZodError } from 'zod'

/**
 * POST /api/barrios/[id]/alias
 *
 * Crea un BarrioAlias (F4): otro nombre que IDENTIFICA al mismo Barrio.
 * Bloqueo duro (409) si el texto ya identifica o apunta territorialmente a
 * OTRO Barrio — nombre canónico, otro alias (defensa en profundidad además
 * vía unique constraint de DB, P2002), o una referencia de otro Barrio.
 * Nunca confirmable, a diferencia del contrato de solapamiento de Zona.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id: barrioId } = await params
  const usuarioId = (authResult.user as { id?: string } | undefined)?.id

  if (!usuarioId) return apiError('Sesión inválida', 401)

  try {
    const body = await request.json()
    const data = BarrioAliasCreateSchema.parse(body)

    const alias = await crearAlias(barrioId, data.texto, usuarioId)
    return apiSuccess({ alias }, 201)
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error instanceof BarrioNoEncontradoError) {
      return apiError('Barrio no encontrado', 404)
    }
    if (error instanceof ConflictoTerritorialError) {
      return apiError(error.detalle, 409)
    }
    if (error instanceof ReferenciaRedundanteError) {
      return apiError(error.message, 409)
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('Ese alias ya está en uso', 409)
    }
    return apiError('Error creando el alias')
  }
}
