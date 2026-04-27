import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { GastoCreateSchema } from '@/lib/validators'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const fecha = searchParams.get('fecha')

  try {
    const gastos = await prisma.gasto.findMany({
      where: fecha
        ? {
            fecha: {
              gte: new Date(new Date(fecha).setHours(0, 0, 0, 0)),
              lt: new Date(new Date(fecha).setHours(23, 59, 59, 999)),
            },
          }
        : undefined,
      orderBy: { fecha: 'desc' },
    })

    return NextResponse.json({ gastos })
  } catch (error) {
    console.error('Error fetching gastos:', error)
    return NextResponse.json({ error: 'Error fetching gastos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
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

    return NextResponse.json({ success: true, gasto })
  } catch (error) {
    console.error('Error creating gasto:', error)
    return NextResponse.json({ error: 'Error creating gasto' }, { status: 500 })
  }
}