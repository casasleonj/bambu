import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { ClienteCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const pagination = getPaginationParams(request.nextUrl.searchParams)
  try {
    const where = { activo: true }
    const prismaPagination = getPrismaPagination(pagination)
    const [clientes, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        orderBy: { nombre: 'asc' },
        include: { _count: { select: { pedidos: true } } },
        ...prismaPagination,
      }),
      prisma.cliente.count({ where }),
    ])
    return NextResponse.json(
      pagination.all
        ? { clientes, total }
        : buildPaginationResponse(clientes, total, pagination.page!, pagination.pageSize!)
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
    const parsed = ClienteCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const cliente = await prisma.cliente.create({
      data: {
        nombre: parsed.data.nombre,
        apellido: parsed.data.apellido,
        telefono: parsed.data.telefono,
        nombreNegocio: parsed.data.nombreNegocio,
        tipoNegocio: parsed.data.tipoNegocio,
        barrio: parsed.data.barrio,
        direccion: parsed.data.direccion,
        frecuencia: parsed.data.frecuencia || 'NINGUNA',
        cadaNDias: parsed.data.cadaNDias,
        preciosEspeciales: parsed.data.preciosEspeciales,
        notas: parsed.data.notas,
      },
    })

    await logAudit({
      entidad: 'Cliente',
      registroId: cliente.id,
      accion: 'CREATE',
      datos: { nombre: cliente.nombre, telefono: cliente.telefono },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, cliente })
  } catch (error) {
    return NextResponse.json({ error: 'Error creating cliente' }, { status: 500 })
  }
}
