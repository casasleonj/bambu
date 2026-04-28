import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { PedidoUpdateSchema } from '@/lib/validators'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
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
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = PedidoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { ...parsed.data }

      // Al marcar como ENTREGADO, copiar cantidades pedidas a entregadas si no se especificaron
      if (parsed.data.estado === 'ENTREGADO') {
        const current = await tx.pedido.findUnique({ where: { id } })
        if (!current) {
          throw new Error('PEDIDO_NOT_FOUND')
        }
        if (parsed.data.cAguaEnt === undefined) updateData.cAguaEnt = current.cAguaPed
        if (parsed.data.cHieloEnt === undefined) updateData.cHieloEnt = current.cHieloPed
        if (parsed.data.cBotellonEnt === undefined) updateData.cBotellonEnt = current.cBotellonPed
        if (parsed.data.cBolsaAguaEnt === undefined) updateData.cBolsaAguaEnt = current.cBolsaAguaPed
        if (parsed.data.cBolsaHieloEnt === undefined) updateData.cBolsaHieloEnt = current.cBolsaHieloPed
      }

      return tx.pedido.update({
        where: { id },
        data: updateData,
      })
    })

    return NextResponse.json({ success: true, pedido })
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }
    console.error('Error updating pedido:', error)
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    await prisma.pedido.update({
      where: { id },
      data: { estado: 'ANULADO' },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error deleting' }, { status: 500 })
  }
}
