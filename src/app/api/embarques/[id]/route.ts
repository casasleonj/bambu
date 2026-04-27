import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const embarque = await prisma.embarque.findUnique({
      where: { id },
      include: {
        trabajador: true,
        pedidos: { include: { cliente: true } },
      },
    })
    if (!embarque) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ embarque })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const { pedidoIds, obs, estado, horaLlegada } = body

    const updateData: Record<string, unknown> = {}
    if (obs !== undefined) updateData.obs = obs
    if (estado) updateData.estado = estado
    if (horaLlegada) updateData.horaLlegada = new Date(horaLlegada)

    if (pedidoIds && Array.isArray(pedidoIds)) {
      await prisma.pedido.updateMany({
        where: { embarqueId: id },
        data: { embarqueId: null },
      })
      
      await prisma.pedido.updateMany({
        where: { id: { in: pedidoIds } },
        data: { embarqueId: id },
      })
    }

    const embarque = await prisma.embarque.update({
      where: { id },
      data: updateData,
      include: {
        trabajador: true,
        pedidos: { include: { cliente: true } },
      },
    })
    return NextResponse.json({ success: true, embarque })
  } catch (error) {
    console.error('Error updating embarque:', error)
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}