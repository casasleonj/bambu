import { NextRequest } from 'next/server'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { BarrioReferenciaCreateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { BarrioNoEncontradoError } from '@/lib/barrios/barrio-service'
import { ReferenciaRedundanteError, crearReferencia } from '@/lib/barrios/referencia-service'
import { ZodError } from 'zod'

/**
 * POST /api/barrios/[id]/referencias
 *
 * Crea un BarrioReferencia (F4): ayuda a ubicar DENTRO del Barrio, pero NO
 * lo identifica globalmente — por eso, a diferencia de `/alias`, nunca
 * bloquea contra otro Barrio (una referencia puede compartirse
 * legítimamente, ej. futuro "La Cancha" en dos barrios). Solo rechaza (409)
 * redundancia dentro del MISMO Barrio (texto ya registrado como su
 * nombre/alias/referencia). El duplicado exacto dentro del mismo Barrio lo
 * resuelve la unique constraint de DB (`@@unique([barrioId,
 * textoNormalizado])`, P2002 → 409).
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
    const data = BarrioReferenciaCreateSchema.parse(body)

    const referencia = await crearReferencia(barrioId, data.texto, usuarioId)
    return apiSuccess({ referencia }, 201)
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error instanceof BarrioNoEncontradoError) {
      return apiError('Barrio no encontrado', 404)
    }
    if (error instanceof ReferenciaRedundanteError) {
      return apiError(error.message, 409)
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('Esa referencia ya está registrada para este barrio', 409)
    }
    return apiError('Error creando la referencia')
  }
}
