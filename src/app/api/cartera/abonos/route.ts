import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { buildDateRangeFilter } from '@/lib/dates'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/cartera/abonos — ADR-CORRECCION-MONETARIA-001 D.5.
 * Lista paginada de abonos para la sección "Cartera" (centro de corrección).
 * Roles: ADMIN + CONTADOR (`view:cartera`).
 *
 * Filtros: `clienteId`, `facturaId`, `metodo`, `desde`/`hasta` (YYYY-MM-DD),
 * `estado` = `corregido` | `sin-corregir`.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const sp = request.nextUrl.searchParams
    const pagination = getPaginationParams(sp)
    const clienteId = sp.get('clienteId')
    const facturaId = sp.get('facturaId')
    const metodo = sp.get('metodo')
    const estado = sp.get('estado')
    const dateFilter = buildDateRangeFilter(sp.get('desde'), sp.get('hasta'))

    const where: Prisma.AbonoWhereInput = {}
    if (clienteId) where.clienteId = clienteId
    if (facturaId) where.facturaId = facturaId
    if (metodo) where.metodoPago = metodo
    if (dateFilter) where.fecha = dateFilter
    if (estado === 'corregido') where.correcciones = { some: {} }
    if (estado === 'sin-corregir') where.correcciones = { none: {} }

    const [abonos, total, agg] = await Promise.all([
      prisma.abono.findMany({
        where,
        orderBy: { fecha: 'desc' },
        select: {
          id: true,
          numero: true,
          monto: true,
          metodoPago: true,
          fecha: true,
          cliente: { select: { id: true, nombre: true, apellido: true, telefono: true } },
          factura: { select: { id: true, numero: true } },
          pedido: { select: { id: true, numero: true, estadoEntrega: true } },
          correcciones: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              numero: true,
              tipo: true,
              montoRevertido: true,
              motivo: true,
              createdAt: true,
              autorizadoPor: { select: { nombre: true, apellido: true, username: true } },
              responsibilityCaseId: true,
            },
          },
        },
        ...getPrismaPagination(pagination),
      }),
      prisma.abono.count({ where }),
      prisma.abono.aggregate({ where, _sum: { monto: true } }),
    ])

    // enriquecer con el neto revertido por abono (para la UI)
    const items = abonos.map((a) => {
      const revertido = a.correcciones.reduce((s, c) => s + Number(c.montoRevertido), 0)
      return {
        ...a,
        monto: Number(a.monto),
        montoRevertido: revertido,
        montoNeto: Number(a.monto) - revertido,
        corregido: a.correcciones.length > 0,
        correcciones: a.correcciones.map((c) => ({ ...c, montoRevertido: Number(c.montoRevertido) })),
      }
    })

    const totales = {
      totalAbonado: Number(agg._sum.monto ?? 0),
      count: total,
    }

    return apiSuccess(
      pagination.all
        ? { data: items, total, totales }
        : { ...buildPaginationResponse(items, total, pagination.page!, pagination.pageSize!), totales },
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching cartera/abonos')
    return apiError('Error listando abonos', 500)
  }
}
