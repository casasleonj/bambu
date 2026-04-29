import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { EmbarqueCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getTodayRange } from '@/lib/dates'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const pagination = getPaginationParams(request.nextUrl.searchParams)
  try {
    const { startOfDay, endOfDay } = getTodayRange()

    const where = pagination.all
      ? { estado: { not: 'CANCELADO' } }
      : {
          fecha: { gte: startOfDay, lt: endOfDay },
          estado: { not: 'CANCELADO' },
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
    
    await logAudit({
      entidad: 'Embarque',
      registroId: embarque.id,
      accion: 'CREATE',
      datos: { numero: embarque.numero, trabajadorId: embarque.trabajadorId },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, embarque })
  } catch (error) {
    console.error('Error creating embarque:', error)
    return NextResponse.json({ error: 'Error creating embarque' }, { status: 500 })
  }
}
