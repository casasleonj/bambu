import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { CompraCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getDateRange } from '@/lib/dates'
import { withAdvisoryLock } from '@/lib/locks'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const pagination = getPaginationParams(request.nextUrl.searchParams)
  try {
    const desde = request.nextUrl.searchParams.get('desde')
    const hasta = request.nextUrl.searchParams.get('hasta')
    const all = request.nextUrl.searchParams.get('all')

    let where: Record<string, unknown> = {}
    if (desde && hasta) {
      const { startDate, endDate } = getDateRange(desde, hasta)
      where = { fecha: { gte: startDate, lt: endDate } }
    }
    if (all === 'true') {
      where = {}
    }

    const prismaPagination = getPrismaPagination(pagination)
    const [compras, total] = await Promise.all([
      prisma.compraInsumo.findMany({
        where,
        orderBy: { fecha: 'desc' },
        include: { insumo: true, proveedor: true },
        ...prismaPagination,
      }),
      prisma.compraInsumo.count({ where }),
    ])
    return apiSuccess(
      pagination.all
        ? { compras, total }
        : buildPaginationResponse(compras, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching compras:')
    return apiError('Error fetching compras', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = CompraCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { insumoId, proveedorId, cantidad, montoTotal } = parsed.data

    const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } })
    if (!insumo) {
      return apiError('Insumo no encontrado', 404)
    }

    // Crear compra y actualizar stock atómicamente (advisory lock previene race conditions)
    const compra = await withAdvisoryLock('COMPRA', async (tx) => {
      const lastCompra = await tx.compraInsumo.findFirst({ orderBy: { numero: 'desc' } })
      const nextNum = lastCompra ? parseInt(lastCompra.numero.replace('COM-', '')) + 1 : 1

      const nuevaCompra = await tx.compraInsumo.create({
        data: {
          numero: `COM-${nextNum.toString().padStart(5, '0')}`,
          insumoId,
          proveedorId,
          cantidad,
          montoTotal,
        },
      })

      await tx.insumo.update({
        where: { id: insumoId },
        data: { stock: { increment: cantidad } },
      })

      return nuevaCompra
    })

    logAudit({
      entidad: 'CompraInsumo',
      registroId: compra.id,
      accion: 'CREATE',
      datos: { insumoId, proveedorId, cantidad, monto: montoTotal },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({}, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating compra:')
    return apiError('Error creating compra', 500)
  }
}