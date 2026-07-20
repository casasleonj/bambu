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

    const [pedidos, total] = await Promise.all([
      prisma.pedido.findMany({
        where,
        include: { cliente: true, pagos: true },
        orderBy: { fecha: 'desc' },
        ...prismaPagination,
      }),
      prisma.pedido.count({ where }),
    ])

    const resumen = {
      totalPedidos: total,
      totalVentas: pedidos.reduce((sum, p) => sum + Number(p.total), 0),
      totalPagado: pedidos.reduce((sum, p) => sum + Number(p.totalPagado || 0), 0),
      totalFiado: pedidos.reduce((sum, p) => sum + (Number(p.saldo) > 0 ? Number(p.saldo) : 0), 0),
      porProducto: {
        pacaAgua: pedidos.reduce((sum, p) => sum + p.cPacaAguaPed, 0),
        pacaHielo: pedidos.reduce((sum, p) => sum + p.cPacaHieloPed, 0),
        botellonFab: pedidos.reduce((sum, p) => sum + p.cBotellonFabPed, 0),
        botellonDom: pedidos.reduce((sum, p) => sum + p.cBotellonDomPed, 0),
        bolsaAgua: pedidos.reduce((sum, p) => sum + p.cBolsaAguaPed, 0),
        bolsaHielo: pedidos.reduce((sum, p) => sum + p.cBolsaHieloPed, 0),
      },
      porMetodoPago: {} as Record<string, number>,
    }

    for (const pedido of pedidos) {
      for (const pago of pedido.pagos) {
        const metodo = pago.metodo
        resumen.porMetodoPago[metodo] = (resumen.porMetodoPago[metodo] || 0) + Number(pago.monto)
      }
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
