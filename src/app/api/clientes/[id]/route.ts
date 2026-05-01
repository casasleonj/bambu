import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ClienteUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
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
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = ClienteUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const cliente = await prisma.cliente.update({
      where: { id },
      data: parsed.data,
    })

    await logAudit({
      entidad: 'Cliente',
      registroId: cliente.id,
      accion: 'UPDATE',
      datos: { nombre: cliente.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, cliente })
  } catch (error) {
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    await prisma.cliente.update({
      where: { id },
      data: { activo: false },
    })

    await logAudit({
      entidad: 'Cliente',
      registroId: id,
      accion: 'DELETE',
      datos: { activo: false },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error deleting' }, { status: 500 })
  }
}
