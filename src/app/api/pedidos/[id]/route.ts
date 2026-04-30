import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { PedidoUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'

function getUserFromSession(authResult: any) {
  return { id: authResult.user?.id || '', role: authResult.user?.role }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const hasAccess = await requireOwnership('pedido', id, getUserFromSession(authResult))
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
  const hasAccess = await requireOwnership('pedido', id, getUserFromSession(authResult))
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
        if (parsed.data.cPacaAguaEnt === undefined) updateData.cPacaAguaEnt = current.cPacaAguaPed
        if (parsed.data.cPacaHieloEnt === undefined) updateData.cPacaHieloEnt = current.cPacaHieloPed
        if (parsed.data.cBotellonFabEnt === undefined) updateData.cBotellonFabEnt = current.cBotellonFabPed
        if (parsed.data.cBotellonDomEnt === undefined) updateData.cBotellonDomEnt = current.cBotellonDomPed
        if (parsed.data.cBolsaAguaEnt === undefined) updateData.cBolsaAguaEnt = current.cBolsaAguaPed
        if (parsed.data.cBolsaHieloEnt === undefined) updateData.cBolsaHieloEnt = current.cBolsaHieloPed
      }

      return tx.pedido.update({
        where: { id },
        data: updateData,
      })
    })

    await logAudit({
      entidad: 'Pedido',
      registroId: pedido.id,
      accion: 'UPDATE',
      datos: { numero: pedido.numero, estado: pedido.estado },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, pedido })
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }
    console.error('Error updating pedido:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    await prisma.pedido.update({
      where: { id },
      data: { estado: 'ANULADO' },
    })

    await logAudit({
      entidad: 'Pedido',
      registroId: id,
      accion: 'DELETE',
      datos: { estado: 'ANULADO' },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error deleting' }, { status: 500 })
  }
}
