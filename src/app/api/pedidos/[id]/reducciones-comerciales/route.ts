import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/** GET /api/pedidos/[id]/reducciones-comerciales — historial de reducciones del pedido y si quien consulta puede autorizar. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const [filas, yo] = await Promise.all([
      prisma.pedidoReduccionComercial.findMany({
        where: { pedidoId: id },
        orderBy: { solicitadoAt: 'desc' },
        include: {
          solicitadoPor: { select: { id: true, nombre: true } },
          resueltoPor: { select: { id: true, nombre: true } },
          notaCredito: { select: { numero: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: auth.user?.id ?? '' },
        select: { activo: true, rol: true, puedeAutorizarReduccionComercial: true },
      }),
    ])
    return apiSuccess({
      puedeAutorizar: Boolean(yo?.activo && yo.puedeAutorizarReduccionComercial && (yo.rol === 'ADMIN' || yo.rol === 'ASISTENTE')),
      reducciones: filas.map((c) => ({
        ...c,
        precio: Number(c.precio),
        monto: Number(c.monto),
        totalAntes: c.totalAntes === null ? null : Number(c.totalAntes),
        totalDespues: c.totalDespues === null ? null : Number(c.totalDespues),
      })),
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error listando reducciones comerciales')
    return apiError('Error al listar las reducciones del pedido', 500)
  }
}
