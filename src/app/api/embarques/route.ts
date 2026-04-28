import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { EmbarqueCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const pagination = getPaginationParams(request.nextUrl.searchParams)
  try {
    const today = new Date().toISOString().split('T')[0]
    const startOfDay = new Date(today + 'T00:00:00.000Z')
    const endOfDay = new Date(today + 'T23:59:59.999Z')

    const where = pagination.all ? {} : {
      fecha: { gte: startOfDay, lt: endOfDay },
    }
    const prismaPagination = getPrismaPagination(pagination)

    const [embarques, total] = await Promise.all([
      prisma.embarque.findMany({
        where,
        include: { trabajador: true, pedidos: true },
        orderBy: { numero: 'desc' },
        ...prismaPagination,
      }),
      prisma.embarque.count({ where }),
    ])

    return NextResponse.json(
      pagination.all
        ? { embarques, total }
        : buildPaginationResponse(embarques, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = EmbarqueCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    
    // Obtener trabajador
    const trabajador = await prisma.trabajador.findUnique({
      where: { id: parsed.data.trabajadorId },
    })
    
    if (!trabajador) {
      return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 400 })
    }
    
    // Crear embarque con número secuencial atómico
    const embarque = await prisma.$transaction(async (tx) => {
      const lastEmbarque = await tx.embarque.findFirst({
        orderBy: { numero: 'desc' },
      })
      const nextNum = (lastEmbarque?.numero || 0) + 1
      
      return tx.embarque.create({
        data: {
          numero: nextNum,
          trabajadorId: parsed.data.trabajadorId,
          horaSalida: parsed.data.horaSalida ? new Date(parsed.data.horaSalida) : null,
          estado: 'ABIERTO',
          obs: parsed.data.obs,
        },
        include: {
          trabajador: true,
        },
      })
    })
    
    return NextResponse.json({ success: true, embarque })
  } catch (error) {
    console.error('Error creating embarque:', error)
    return NextResponse.json({ error: 'Error creating embarque' }, { status: 500 })
  }
}
