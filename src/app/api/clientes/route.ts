import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { ClienteCreateSchema } from '@/lib/validators'

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
        precioAguaPref: parsed.data.precioAguaPref,
        notas: parsed.data.notas,
      },
    })
    return NextResponse.json({ success: true, cliente })
  } catch (error) {
    return NextResponse.json({ error: 'Error creating cliente' }, { status: 500 })
  }
}