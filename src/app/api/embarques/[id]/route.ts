import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { EmbarqueUpdateSchema } from '@/lib/validators'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
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
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = EmbarqueUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { pedidoIds, obs, estado, horaLlegada, ...rest } = parsed.data

    const embarque = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { ...rest }
      if (obs !== undefined) updateData.obs = obs
      if (estado) updateData.estado = estado
      if (horaLlegada) updateData.horaLlegada = new Date(horaLlegada)

      if (pedidoIds && Array.isArray(pedidoIds)) {
        // Unassign current pedidos
        await tx.pedido.updateMany({
          where: { embarqueId: id },
          data: { embarqueId: null },
        })
        // Assign new pedidos atomically
        await tx.pedido.updateMany({
          where: { id: { in: pedidoIds } },
          data: { embarqueId: id },
        })
      }

      return tx.embarque.update({
        where: { id },
        data: updateData,
        include: {
          trabajador: true,
          pedidos: { include: { cliente: true } },
        },
      })
    })

    return NextResponse.json({ success: true, embarque })
  } catch (error) {
    console.error('Error updating embarque:', error)
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}
