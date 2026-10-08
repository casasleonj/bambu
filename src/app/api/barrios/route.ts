import { NextRequest } from 'next/server'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { BarrioCreateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiList, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { buscarBarrios, crearBarrio } from '@/lib/barrios/barrio-service'
import { ZodError } from 'zod'

/**
 * GET /api/barrios?q=&incluirInactivos=1&limit=&incluirRelaciones=1
 *
 * Búsqueda para el selector canónico de Cliente/Negocio/Zona. `q` filtra por
 * substring determinista sobre el nombre normalizado y, desde F4, también
 * sobre BarrioAlias/BarrioReferencia (sin fuzzy matching — ver
 * src/lib/barrios/barrio-service.ts). Por defecto solo devuelve barrios
 * activos; `incluirInactivos=1` los incluye (usado por la administración
 * territorial para mostrar/reactivar archivados). `limit` es opcional
 * (default 20, igual que antes, para no afectar a los selectores de
 * autocomplete existentes); la administración del catálogo
 * (`/configuracion/barrios`) pide un límite mayor para listar todo.
 * `incluirRelaciones=1` (F4, solo administración) agrega las listas
 * completas de alias/referencias de cada barrio, sin importar `q`.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const incluirInactivos = searchParams.get('incluirInactivos') === '1'
  const incluirRelaciones = searchParams.get('incluirRelaciones') === '1'
  const limitParam = Number(searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : undefined

  try {
    const barrios = await buscarBarrios(q, { incluirInactivos, limit, incluirRelaciones })
    return apiList(barrios)
  } catch {
    return apiError('Error buscando barrios', 500)
  }
}

/**
 * POST /api/barrios
 *
 * Crea un Barrio canónico. La unicidad la garantiza la constraint de DB
 * sobre `nombreNormalizado` (P2002 → 409) — no confiamos en una
 * comprobación previa del frontend para evitar duplicados.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const data = BarrioCreateSchema.parse(body)

    const barrio = await crearBarrio(data.nombre)

    logAudit({
      entidad: 'Barrio',
      registroId: barrio.id,
      accion: 'CREATE',
      datos: { nombre: barrio.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ barrio }, 201)
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('Ya existe un barrio con ese nombre', 409)
    }
    return apiError('Error creando barrio')
  }
}
