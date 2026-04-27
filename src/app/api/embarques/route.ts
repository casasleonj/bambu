import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { EmbarqueCreateSchema } from '@/lib/validators'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const embarques = await prisma.embarque.findMany({
      where: {
        fecha: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
      include: {
        trabajador: true,
        pedidos: true,
      },
      orderBy: { numero: 'desc' },
    })
    return NextResponse.json({ embarques })
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
    
    // Obtener siguiente número secuencial
    const lastEmbarque = await prisma.embarque.findFirst({
      orderBy: { numero: 'desc' },
    })
    const nextNum = (lastEmbarque?.numero || 0) + 1
    
    // Obtener trabajador
    const trabajador = await prisma.trabajador.findUnique({
      where: { id: parsed.data.trabajadorId },
    })
    
    if (!trabajador) {
      return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 400 })
    }
    
    const embarque = await prisma.embarque.create({
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
    return NextResponse.json({ success: true, embarque })
  } catch (error) {
    console.error('Error creating embarque:', error)
    return NextResponse.json({ error: 'Error creating embarque' }, { status: 500 })
  }
}