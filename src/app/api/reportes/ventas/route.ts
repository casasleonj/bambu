import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { z } from 'zod'
import { EstadoPedido } from '@prisma/client'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { startOfDayInBogota, endOfDayInBogota } from '@/lib/date-helpers'

const ReporteVentasSchema = z.object({
  start: z.string().datetime().optional().or(z.string().date()),
  end: z.string().datetime().optional().or(z.string().date()),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  all: z.coerce.boolean().optional(),
})

function toDateBoundary(value: string | undefined, boundary: 'start' | 'end'): Date {
  if (!value) {
    if (boundary === 'start') {
      const d = new Date()
      d.setDate(d.getDate() - 30)
      return d
    }
    return new Date()
  }
  if (value.includes('T')) return new Date(value)
  return boundary === 'start' ? startOfDayInBogota(value) : endOfDayInBogota(value)
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const validation = ReporteVentasSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    )
    if (!validation.success) {
      return apiError('Parámetros inválidos', 400, validation.error.flatten())
    }

    const { start, end, page, pageSize, all } = validation.data

    const dateFilter = {
      gte: toDateBoundary(start, 'start'),
      lte: toDateBoundary(end, 'end'),
    }

    const where = {
      fecha: dateFilter,
      estado: { not: EstadoPedido.CANCELADO },
    }

    const pagination = all ? { all: true } : { page: page ?? 1, pageSize: pageSize ?? 10 }
    const prismaPagination = getPrismaPagination(pagination)

    const [pedidos, total, ventasAgg, pagosPorMetodo, fiadoAgg] = await Promise.all([
      prisma.pedido.findMany({
        where,
        include: { cliente: true, pagos: true },
        orderBy: { fecha: 'desc' },
        ...prismaPagination,
      }),
      prisma.pedido.count({ where }),
      prisma.pedido.aggregate({
        where,
        _sum: {
          total: true,
          totalPagado: true,
          cPacaAguaPed: true,
          cPacaHieloPed: true,
          cBotellonFabPed: true,
          cBotellonDomPed: true,
          cBolsaAguaPed: true,
          cBolsaHieloPed: true,
        },
      }),
      prisma.pago.groupBy({
        by: ['metodo'],
        where: {
          pedido: {
            fecha: dateFilter,
            estado: { not: EstadoPedido.CANCELADO },
          },
        },
        _sum: { monto: true },
      }),
      prisma.pedido.aggregate({
        where: { ...where, saldo: { gt: 0 } },
        _sum: { saldo: true },
      }),
    ])

    const resumen = {
      totalPedidos: total,
      totalVentas: Number(ventasAgg._sum.total ?? 0),
      totalPagado: Number(ventasAgg._sum.totalPagado ?? 0),
      totalFiado: Number(fiadoAgg._sum.saldo ?? 0),
      porProducto: {
        pacaAgua: Number(ventasAgg._sum.cPacaAguaPed ?? 0),
        pacaHielo: Number(ventasAgg._sum.cPacaHieloPed ?? 0),
        botellonFab: Number(ventasAgg._sum.cBotellonFabPed ?? 0),
        botellonDom: Number(ventasAgg._sum.cBotellonDomPed ?? 0),
        bolsaAgua: Number(ventasAgg._sum.cBolsaAguaPed ?? 0),
        bolsaHielo: Number(ventasAgg._sum.cBolsaHieloPed ?? 0),
      },
      porMetodoPago: Object.fromEntries(
        pagosPorMetodo.map((p) => [p.metodo, Number(p._sum.monto ?? 0)])
      ),
    }

    return apiSuccess(
      pagination.all
        ? { pedidos, resumen, total }
        : { ...buildPaginationResponse(pedidos, total, pagination.page!, pagination.pageSize!), resumen }
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching reporte ventas:')
    return apiError('Error fetching reporte', 500)
  }
}
