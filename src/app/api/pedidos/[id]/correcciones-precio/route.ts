import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/** GET /api/pedidos/[id]/correcciones-precio — historial de correcciones del pedido (más reciente primero). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const filas = await prisma.pedidoCorreccionPrecio.findMany({
      where: { pedidoId: id },
      orderBy: { solicitadoAt: 'desc' },
      include: {
        solicitadoPor: { select: { id: true, nombre: true } },
        resueltoPor: { select: { id: true, nombre: true } },
      },
    })
    return apiSuccess({
      correcciones: filas.map((c) => ({
        ...c,
        precioAnterior: Number(c.precioAnterior),
        precioNuevo: Number(c.precioNuevo),
        delta: Number(c.delta),
        totalAntes: c.totalAntes === null ? null : Number(c.totalAntes),
        totalDespues: c.totalDespues === null ? null : Number(c.totalDespues),
      })),
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error listando correcciones de precio')
    return apiError('Error al listar las correcciones de precio', 500)
  }
}
