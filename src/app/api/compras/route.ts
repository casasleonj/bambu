import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { CompraCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getDateRange } from '@/lib/dates'
import { withAdvisoryLock } from '@/lib/locks'

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
    return NextResponse.json(
      pagination.all
        ? { compras, total }
        : buildPaginationResponse(compras, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    console.error('Error fetching compras:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching compras' }, { status: 500 })
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
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }
    const { insumoId, proveedorId, cantidad, montoTotal } = parsed.data

    const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } })
    if (!insumo) {
      return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })
    }

    // Crear compra y actualizar stock atómicamente (advisory lock previene race conditions)
    await withAdvisoryLock('COMPRA', async (tx) => {
      const lastCompra = await tx.compraInsumo.findFirst({ orderBy: { numero: 'desc' } })
      const nextNum = lastCompra ? parseInt(lastCompra.numero.replace('COM-', '')) + 1 : 1

      await tx.compraInsumo.create({
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
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('Error creating compra:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error creating compra' }, { status: 500 })
  }
}