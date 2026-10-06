import { NextRequest } from 'next/server'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { requireAuth, requirePermission, requireRole } from '@/lib/auth-check'
import { ZonaUpdateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import {
  ZonaNoEncontradaError,
  archivarZona,
  obtenerZonaConBarrios,
  reactivarZona,
  renombrarZona,
} from '@/lib/zonas/zona-service'
import { ZodError } from 'zod'

/**
 * GET /api/zonas/[id]
 *
 * Detalle de una Zona con sus Barrios vinculados (vista "Zona Norte ->
 * Barrios de esta zona" de `/configuracion/zonas`).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requirePermission('view:configuracion')
  if (authResult instanceof Response) return authResult

  const { id } = await params

  try {
    const zona = await obtenerZonaConBarrios(id)
    if (!zona) return apiError('Zona no encontrada', 404)
    return apiSuccess({ zona })
  } catch {
    return apiError('Error obteniendo zona', 500)
  }
}

/**
 * PATCH /api/zonas/[id]
 *
 * Cubre rename, archivado y reactivación. Mismo patrón que
 * PATCH /api/barrios/[id], pero solo ADMIN (no ASISTENTE).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const usuarioId = (authResult.user as { id?: string } | undefined)?.id ?? null

  try {
    const body = await request.json()
    const data = ZonaUpdateSchema.parse(body)

    let zona = await obtenerZonaConBarrios(id)
    if (!zona) return apiError('Zona no encontrada', 404)

    if (data.nombre !== undefined && data.nombre !== zona.nombre) {
      const renombrada = await renombrarZona(id, data.nombre, usuarioId)
      zona = { ...zona, ...renombrada }
    }

    if (data.activo !== undefined && data.activo !== zona.activo) {
      const actualizada = data.activo ? await reactivarZona(id, usuarioId) : await archivarZona(id, usuarioId)
      zona = { ...zona, ...actualizada }
    }

    return apiSuccess({ zona })
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error instanceof ZonaNoEncontradaError) {
      return apiError('Zona no encontrada', 404)
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('Ya existe una zona con ese nombre', 409)
    }
    return apiError('Error actualizando zona')
  }
}
