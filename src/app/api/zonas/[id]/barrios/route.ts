import { NextRequest } from 'next/server'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ZonaBarrioAddSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { BarrioNoEncontradoError } from '@/lib/barrios/barrio-service'
import { ZonaNoEncontradaError, agregarBarrioAZona } from '@/lib/zonas/zona-service'
import { ZodError } from 'zod'

/**
 * POST /api/zonas/[id]/barrios
 *
 * Agrega un Barrio a una Zona. Implementa el contrato de solapamiento del
 * ALS §7-8 en dos pasos:
 *
 *  1. Sin `confirmOverlap` (o `false`): si el Barrio ya pertenece a otra
 *     Zona activa, NO se persiste nada. Responde 200 con
 *     `{ overlapDetected: true, requiresConfirmation: true, existingZones }`.
 *  2. Con `confirmOverlap: true`: el backend vuelve a evaluar el
 *     solapamiento contra el estado actual (nunca confía en lo que la UI
 *     vio antes) y persiste. Responde 201 con `{ zonaBarrio,
 *     overlapDetected, existingZones }`.
 *
 * Si no hay solapamiento, se persiste directamente en el primer request
 * (201), sin pedir confirmación.
 *
 * `source`/`createdBy` nunca se leen del body (ver ZonaBarrioAddSchema) —
 * el servicio los fija desde el servidor/sesión.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id: zonaId } = await params
  const usuarioId = (authResult.user as { id?: string } | undefined)?.id ?? null

  try {
    const body = await request.json()
    const data = ZonaBarrioAddSchema.parse(body)

    const resultado = await agregarBarrioAZona(zonaId, data.barrioId, usuarioId, {
      confirmOverlap: data.confirmOverlap ?? false,
    })

    if (resultado.status === 'requires_confirmation') {
      return apiSuccess({
        overlapDetected: true,
        requiresConfirmation: true,
        existingZones: resultado.existingZones,
      })
    }

    return apiSuccess(
      {
        zonaBarrio: resultado.zonaBarrio,
        overlapDetected: resultado.overlapDetected,
        existingZones: resultado.existingZones,
      },
      201,
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error instanceof ZonaNoEncontradaError) {
      return apiError('Zona no encontrada', 404)
    }
    if (error instanceof BarrioNoEncontradoError) {
      return apiError('Barrio no encontrado', 404)
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('Ese barrio ya pertenece a esta zona', 409)
    }
    return apiError('Error agregando barrio a la zona')
  }
}
