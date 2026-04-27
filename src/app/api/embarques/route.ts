import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
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
  try {
    const body = await request.json()
    
    // Obtener siguiente número secuencial
    const lastEmbarque = await prisma.embarque.findFirst({
      orderBy: { numero: 'desc' },
    })
    const nextNum = (lastEmbarque?.numero || 0) + 1
    
    // Obtener trabajador
    const trabajador = await prisma.trabajador.findUnique({
      where: { id: body.trabajadorId },
    })
    
    if (!trabajador) {
      return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 400 })
    }
    
    const embarque = await prisma.embarque.create({
      data: {
        numero: nextNum,
        trabajadorId: body.trabajadorId,
        horaSalida: body.horaSalida ? new Date(body.horaSalida) : null,
        estado: 'ABIERTO',
        obs: body.obs,
        trabajador: {
          connect: { id: body.trabajadorId },
        },
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