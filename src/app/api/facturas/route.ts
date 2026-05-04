import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { FacturaCreateSchema } from '@/lib/validators'
import { getNextNumero } from '@/lib/sequence'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getDateRange } from '@/lib/dates'
import { logAudit } from '@/lib/audit'
import { withAdvisoryLock } from '@/lib/locks'
import type { Factura } from '@prisma/client'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pendiente = searchParams.get('pendiente') === 'true'
  const pagination = getPaginationParams(searchParams)

  try {
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const all = searchParams.get('all')

    let where: Record<string, unknown> = pendiente ? { saldo: { gt: 0 } } : {}
    if (desde && hasta) {
      const { startDate, endDate } = getDateRange(desde, hasta)
      where.fecha = { gte: startDate, lt: endDate }
    }
    if (all === 'true') {
      delete where.fecha
    }
    const prismaPagination = getPrismaPagination(pagination)

    const [facturas, total] = await Promise.all([
      prisma.factura.findMany({
        where,
        orderBy: { fecha: 'desc' },
        include: { cliente: true, abonos: true },
        ...prismaPagination,
      }),
      prisma.factura.count({ where }),
    ])

    return NextResponse.json(
      pagination.all
        ? { facturas, total }
        : buildPaginationResponse(facturas, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    console.error('Error fetching facturas:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching facturas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = FacturaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }
    const { pedidoId, clienteId } = parsed.data

    const factura = await withAdvisoryLock<Factura>('FACTURA_NUM', async (tx) => {
      // Verificar que el pedido existe y no tiene factura ya
      const pedido = await tx.pedido.findUnique({
        where: { id: pedidoId },
        include: { cliente: true, factura: true },
      })

      if (!pedido) {
        throw new Error('Pedido no encontrado')
      }

      if (pedido.factura) {
        throw new Error('El pedido ya tiene una factura')
      }

      // Calcular siguiente número (dentro del lock para evitar duplicados)
      const nextNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })

      return tx.factura.create({
        data: {
          numero: `FAC-${nextNum.toString().padStart(5, '0')}`,
          clienteId,
          pedidoId,
          subtotal: pedido.total,
          total: pedido.total,
          saldo: pedido.total,
        },
      })
    })

    await logAudit({
      entidad: 'Factura',
      registroId: factura.id,
      accion: 'CREATE',
      datos: { numero: factura.numero, pedidoId, total: Number(factura.total) },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, factura }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    if (message === 'Pedido no encontrado') {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }
    if (message === 'El pedido ya tiene una factura') {
      return NextResponse.json({ error: 'El pedido ya tiene una factura' }, { status: 409 })
    }
    console.error('Error creating factura:', message)
    return NextResponse.json({ error: 'Error creating factura' }, { status: 500 })
  }
}