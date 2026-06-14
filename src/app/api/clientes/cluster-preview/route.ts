/**
 * GET /api/clientes/cluster-preview
 *
 * Devuelve clusters DBSCAN sobre clientes con coordenadas. Útil para
 * que el admin visualice cómo se agruparían las rutas antes de
 * asignar repartidores.
 *
 * Query params:
 *  - eps: radio en km (default 1.5)
 *  - minPts: mínimo de puntos para ser core (default 3)
 *  - all: si 'true', incluye clientes sin pedidos pendientes
 *
 * Auth: ADMIN, ASISTENTE.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { previewClusters } from '@/lib/geo/cluster-clientes'
import { formatZodError } from '@/lib/utils'

const QuerySchema = z.object({
  eps: z.coerce.number().positive().max(50).optional(),
  minPts: z.coerce.number().int().positive().max(50).optional(),
  all: z.coerce.boolean().optional(),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const validation = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  )
  if (!validation.success) {
    return apiError('Parámetros inválidos', 400, { formErrors: [formatZodError(validation.error)] })
  }

  const { eps, minPts, all } = validation.data
  const result = await previewClusters({
    epsKm: eps,
    minPts,
    onlyWithPedidos: !all,
  })

  return apiSuccess(result)
}
