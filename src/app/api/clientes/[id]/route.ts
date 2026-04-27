import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        pedidos: { orderBy: { fecha: 'desc' }, take: 10 },
        facturas: { orderBy: { fecha: 'desc' } },
        _count: { select: { pedidos: true } },
      },
    })
    if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ cliente })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const cliente = await prisma.cliente.update({
      where: { id },
      data: body,
    })
    return NextResponse.json({ success: true, cliente })
  } catch (error) {
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.cliente.update({
      where: { id },
      data: { activo: false },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error deleting' }, { status: 500 })
  }
}