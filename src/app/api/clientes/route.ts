import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const clientes = await prisma.cliente.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: {
        _count: { select: { pedidos: true } },
      },
    })
    return NextResponse.json({ clientes })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()

    const cliente = await prisma.cliente.create({
      data: {
        nombre: body.nombre,
        apellido: body.apellido,
        telefono: body.telefono,
        nombreNegocio: body.nombreNegocio,
        tipoNegocio: body.tipoNegocio,
        barrio: body.barrio,
        direccion: body.direccion,
        frecuencia: body.frecuencia || 'NINGUNA',
        cadaNDias: body.cadaNDias,
        precioAguaPref: body.precioAguaPref,
        notas: body.notas,
      },
    })
    return NextResponse.json({ success: true, cliente })
  } catch (error) {
    return NextResponse.json({ error: 'Error creating cliente' }, { status: 500 })
  }
}