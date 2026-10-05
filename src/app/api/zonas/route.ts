import { NextRequest } from 'next/server'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { requireAuth, requirePermission, requireRole } from '@/lib/auth-check'
import { ZonaCreateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiList, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { buscarZonas, crearZona } from '@/lib/zonas/zona-service'
import { ZodError } from 'zod'

/**
 * GET /api/zonas?q=&incluirInactivas=1
 *
 * Listado/búsqueda para la administración territorial
 * (`/configuracion/zonas`). Gateado por el mismo permiso de la página que
 * lo consume (`view:configuracion`) — no por rol directo, para no
 * duplicar la matriz de permisos ya existente (ADMIN y CONTADOR la tienen,
 * ASISTENTE no; ver src/lib/permissions.ts).
 */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission('view:configuracion')
  if (authResult instanceof Response) return authResult

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const incluirInactivas = searchParams.get('incluirInactivas') === '1'

  try {
    const zonas = await buscarZonas(q, { incluirInactivas })
    return apiList(zonas)
  } catch {
    return apiError('Error buscando zonas', 500)
  }
}

/**
 * POST /api/zonas
 *
 * Crea una Zona. Solo ADMIN (más estricto que Barrio: decisión explícita
 * del equipo de no heredar el ASISTENTE-con-write de Barrio para Zona).
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const data = ZonaCreateSchema.parse(body)

    const usuarioId = (authResult.user as { id?: string } | undefined)?.id ?? null
    const zona = await crearZona(data.nombre, usuarioId)

    return apiSuccess({ zona }, 201)
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('Ya existe una zona con ese nombre', 409)
    }
    return apiError('Error creando zona')
  }
}
