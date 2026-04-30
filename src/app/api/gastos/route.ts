import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { GastoCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const fecha = searchParams.get('fecha')
  const pagination = getPaginationParams(searchParams)

  try {
    const where: any = fecha
      ? {
          fecha: {
            gte: new Date(new Date(fecha).setHours(0, 0, 0, 0)),
            lt: new Date(new Date(fecha).setHours(23, 59, 59, 999)),
          },
        }
      : {}

    const prismaPagination = getPrismaPagination(pagination)

    const [gastos, total] = await Promise.all([
      prisma.gasto.findMany({
        where,
        orderBy: { fecha: 'desc' },
        ...prismaPagination,
      }),
      prisma.gasto.count({ where }),
    ])

    return NextResponse.json(
      pagination.all
        ? { gastos, total }
        : buildPaginationResponse(gastos, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    console.error('Error fetching gastos:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching gastos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = GastoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { categoria, descripcion, monto, responsable, notas, fecha } = parsed.data

    const gasto = await prisma.gasto.create({
      data: {
        categoria,
        descripcion,
        monto,
        responsable,
        notas,
        fecha: fecha ? new Date(fecha) : new Date(),
      },
    })

    return NextResponse.json({ success: true, gasto }, { status: 201 })
  } catch (error) {
    console.error('Error creating gasto:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error creating gasto' }, { status: 500 })
  }
}