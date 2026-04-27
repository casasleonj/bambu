import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id },
      include: { cliente: true, embarque: true },
    })
    if (!pedido) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ pedido })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const updateData: Record<string, unknown> = {}
    if (body.embarqueId !== undefined) updateData.embarqueId = body.embarqueId
    if (body.estado) updateData.estado = body.estado

    const pedido = await prisma.pedido.update({
      where: { id },
      data: updateData,
    })
    return NextResponse.json({ success: true, pedido })
  } catch (error) {
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.pedido.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error deleting' }, { status: 500 })
  }
}