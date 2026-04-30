import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { EmbarqueUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    const embarque = await prisma.embarque.findUnique({
      where: { id },
      include: {
        trabajador: true,
        ruta: true,
        pedidos: {
          include: { cliente: true, pagos: true },
        },
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

    await logAudit({
      entidad: 'Embarque',
      registroId: embarque.id,
      accion: 'UPDATE',
      datos: { numero: embarque.numero, estado: embarque.estado },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, embarque })
  } catch (error) {
    console.error('Error updating embarque:', error)
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params

  try {
    const result = await prisma.$transaction(async (tx) => {
      const embarque = await tx.embarque.findUnique({
        where: { id },
        include: { pedidos: true },
      })

      if (!embarque) {
        throw new Error('EMBARQUE_NOT_FOUND')
      }

      if (embarque.estado === 'CERRADO') {
        throw new Error('EMBARQUE_CERRADO')
      }

      // Unassign all pedidos and return them to PENDIENTE
      if (embarque.pedidos.length > 0) {
        await tx.pedido.updateMany({
          where: { embarqueId: id },
          data: { embarqueId: null, estado: 'PENDIENTE' },
        })
      }

      // Soft-delete by marking as CANCELADO
      return tx.embarque.update({
        where: { id },
        data: { estado: 'CANCELADO' },
      })
    })

    await logAudit({
      entidad: 'Embarque',
      registroId: result.id,
      accion: 'DELETE',
      datos: { numero: result.numero, estado: 'CANCELADO' },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'EMBARQUE_NOT_FOUND') {
      return NextResponse.json({ error: 'Embarque no encontrado' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'EMBARQUE_CERRADO') {
      return NextResponse.json({ error: 'No se puede cancelar un embarque cerrado' }, { status: 400 })
    }
    console.error('Error canceling embarque:', error)
    return NextResponse.json({ error: 'Error al cancelar embarque' }, { status: 500 })
  }
}
