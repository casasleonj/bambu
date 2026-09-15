import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'

const RevisarImpactoSchema = z.object({
  nota: z.string().optional(),
})

/**
 * PATCH /api/pedidos/impacto-ubicacion/[id] — F3 (Impacto en Demanda).
 * Marca una señal como revisada. Es literalmente "marcar como visto": no
 * reinterpreta nada, no dispara ninguna acción sobre el Pedido — no es una
 * autorización financiera ni una excepción, por eso no exige un permiso
 * especial más allá de estar autenticado con un rol que ya opera Pedidos.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], auth)
  if (role instanceof Response) return role
  const actorId = role.user?.id
  if (!actorId) return apiError('No autorizado', 401)

  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const parsed = RevisarImpactoSchema.safeParse(body)
  if (!parsed.success) return apiError('Datos inválidos', 400)

  const impacto = await prisma.pedidoImpactoUbicacion.findUnique({ where: { id } })
  if (!impacto) return apiError('Señal de impacto no encontrada', 404)

  if (impacto.revisadoAt) {
    return apiSuccess({ impacto, deduped: true })
  }

  const actualizado = await prisma.pedidoImpactoUbicacion.update({
    where: { id },
    data: {
      revisadoPorId: actorId,
      revisadoAt: new Date(),
      notaRevision: parsed.data.nota,
    },
  })

  return apiSuccess({ impacto: actualizado, deduped: false })
}
