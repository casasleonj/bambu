import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/pedidos/impacto-ubicacion?pedidoId=X — F3 (Impacto en Demanda).
 * Lista las señales de un Pedido (por defecto solo las sin revisar). Solo
 * lectura — no reinterpreta nada, no dispara ninguna acción.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], auth)
  if (role instanceof Response) return role

  const { searchParams } = new URL(request.url)
  const pedidoId = searchParams.get('pedidoId')
  if (!pedidoId) return apiError('pedidoId requerido', 400)

  const soloPendientes = searchParams.get('soloPendientes') !== 'false'

  const impactos = await prisma.pedidoImpactoUbicacion.findMany({
    where: {
      pedidoId,
      ...(soloPendientes ? { revisadoAt: null } : {}),
    },
    orderBy: { detectadoAt: 'desc' },
  })

  return apiSuccess({ impactos })
}
