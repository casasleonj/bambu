import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { z } from 'zod'

const ReporteVentasSchema = z.object({
  start: z.string().datetime().optional().or(z.string().date()),
  end: z.string().datetime().optional().or(z.string().date()),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  all: z.coerce.boolean().optional(),
})

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
      return NextResponse.json({ error: 'Parámetros inválidos', details: validation.error.flatten() }, { status: 400 })
    }

    const { start, end, page, pageSize, all } = validation.data

    const dateFilter = {
      gte: start ? new Date(start) : new Date(new Date().setDate(new Date().getDate() - 30)),
      lte: end ? new Date(end) : new Date(),
    }

    const where = {
      fecha: dateFilter,
      estado: { not: 'CANCELADO' as any },
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

    return NextResponse.json(
      pagination.all
        ? { pedidos, resumen, total }
        : { ...buildPaginationResponse(pedidos, total, pagination.page!, pagination.pageSize!), resumen }
    )
  } catch (error) {
    console.error('Error fetching reporte ventas:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching reporte' }, { status: 500 })
  }
}
