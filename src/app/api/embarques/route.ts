import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { EmbarqueCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getTodayRange } from '@/lib/dates'
import { logAudit } from '@/lib/audit'
import { calcularPacasEmbarque } from '@/lib/embarque-capacidad'
import { withAdvisoryLock } from '@/lib/locks'
import { EstadoEmbarque } from '@prisma/client'
import { ROLES } from '@/lib/constants'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const pagination = getPaginationParams(request.nextUrl.searchParams)
  try {
    const { startOfDay, endOfDay } = getTodayRange()

    const where = pagination.all
      ? { estado: { not: EstadoEmbarque.CANCELADO } }
      : {
          fecha: { gte: startOfDay, lt: endOfDay },
          estado: { not: EstadoEmbarque.CANCELADO },
        }
    const prismaPagination = getPrismaPagination(pagination)

    const [embarquesRaw, total] = await Promise.all([
      prisma.embarque.findMany({
        where,
        include: {
          trabajador: { select: { id: true, nombre: true } },
          ruta: { select: { id: true, nombre: true } },
          pedidos: {
            select: {
              id: true, numero: true, estado: true, canal: true, total: true, saldo: true,
              cPacaAguaPed: true, cPacaHieloPed: true, cBotellonFabPed: true, cBotellonDomPed: true,
              cBolsaAguaPed: true, cBolsaHieloPed: true,
              cliente: { select: { id: true, nombre: true, barrio: true } },
            },
          },
        },
        orderBy: { numero: 'desc' },
        ...prismaPagination,
      }),
      prisma.embarque.count({ where }),
    ])

    // Add capacity calculation
    const embarques = embarquesRaw.map((e) => ({
      ...e,
      totalPacas: calcularPacasEmbarque(e.pedidos),
    }))

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
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.REPARTIDOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = EmbarqueCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }

    const totalPacas = (parsed.data.pacasAgua || 0) + (parsed.data.pacasHielo || 0)
    if (totalPacas > 70) {
      return NextResponse.json({ error: `Capacidad excedida: ${totalPacas} pacas. Máximo 70.` }, { status: 400 })
    }
    
    const trabajador = await prisma.trabajador.findUnique({
      where: { id: parsed.data.trabajadorId },
    })
    
    if (!trabajador) {
      return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 400 })
    }
    
    const embarque = await prisma.embarque.create({
      data: {
        trabajadorId: parsed.data.trabajadorId,
        rutaId: parsed.data.rutaId || null,
        horaSalida: parsed.data.horaSalida ? new Date(parsed.data.horaSalida) : null,
        estado: EstadoEmbarque.ABIERTO,
        obs: parsed.data.obs,
        pacasAgua: parsed.data.pacasAgua || 0,
        pacasHielo: parsed.data.pacasHielo || 0,
        devueltasAgua: parsed.data.devueltasAgua || 0,
        devueltasHielo: parsed.data.devueltasHielo || 0,
        rotasAgua: parsed.data.rotasAgua || 0,
        rotasHielo: parsed.data.rotasHielo || 0,
      },
      include: {
        trabajador: true,
        ruta: true,
      },
    })
    
    await logAudit({
      entidad: 'Embarque',
      registroId: embarque.id,
      accion: 'CREATE',
      datos: { numero: embarque.numero, trabajadorId: embarque.trabajadorId, pacasAgua: embarque.pacasAgua, pacasHielo: embarque.pacasHielo },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, embarque }, { status: 201 })
  } catch (error) {
    console.error('Error creating embarque:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error creating embarque' }, { status: 500 })
  }
}
