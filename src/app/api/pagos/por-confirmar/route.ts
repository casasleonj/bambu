import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { getConfig } from '@/lib/config'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

/**
 * GET /api/pagos/por-confirmar — ADR-PAGO-REPORTADO-CONFIRMADO-001 §3.
 *
 * Cola de `Pago` con `confirmacion = REPORTADO`, enriquecida. La ve SOLO el
 * usuario designado en `Config.USUARIO_CONFIRMA_PAGOS`. Si no está seteado,
 * nadie la ve (403) y los pagos quedan REPORTADO — no bloquea la operación.
 *
 * Auth: `requireAuth()` + guard explícito por userId (excepción documentada al
 * patrón `requireRole`).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = (authResult.user as { id?: string } | undefined)?.id

  const confirmador = await getConfig('USUARIO_CONFIRMA_PAGOS')
  if (!confirmador || confirmador !== userId) {
    return apiError('Solo el usuario designado para confirmar pagos puede ver esta cola', 403)
  }

  try {
    const sp = request.nextUrl.searchParams
    const pagination = getPaginationParams(sp)

    const where = { confirmacion: 'REPORTADO' as const }
    const [pagos, total, agg] = await Promise.all([
      prisma.pago.findMany({
        where,
        // más viejos primero; `id` como desempate estable (pagos del mismo
        // batch offline comparten `createdAt` → sin tiebreaker se duplican /
        // saltan filas al paginar).
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          monto: true,
          metodo: true,
          createdAt: true,
          offlineId: true,
          pedido: {
            select: {
              id: true,
              numero: true,
              total: true,
              cliente: { select: { id: true, nombre: true, apellido: true, telefono: true } },
            },
          },
        },
        ...getPrismaPagination(pagination),
      }),
      prisma.pago.count({ where }),
      prisma.pago.aggregate({ where, _sum: { monto: true } }),
    ])

    const items = pagos.map((p) => ({
      ...p,
      monto: Number(p.monto),
      pedido: { ...p.pedido, total: Number(p.pedido.total) },
    }))
    const totales = { montoPendiente: Number(agg._sum.monto ?? 0), count: total }

    return apiSuccess(
      pagination.all
        ? { data: items, total, totales }
        : { ...buildPaginationResponse(items, total, pagination.page!, pagination.pageSize!), totales },
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error listando pagos por confirmar')
    return apiError('Error listando pagos por confirmar', 500)
  }
}
