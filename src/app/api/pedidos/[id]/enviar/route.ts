import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'

function getUserFromSession(authResult: any) {
  return { id: authResult.user?.id || '', role: authResult.user?.role }
}

const EnviarPedidoSchema = z.object({
  embarqueId: z.string().uuid(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const hasAccess = await requireOwnership('pedido', id, getUserFromSession(authResult))
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const parsed = EnviarPedidoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { embarqueId } = parsed.data

    const pedido = await prisma.$transaction(async (tx) => {
      // 1. Verify pedido exists and is PENDIENTE
      const current = await tx.pedido.findUnique({ where: { id } })
      if (!current) {
        throw new Error('PEDIDO_NOT_FOUND')
      }
      if (current.estado !== 'PENDIENTE') {
        throw new Error('PEDIDO_NOT_PENDIENTE')
      }
      if (current.embarqueId) {
        throw new Error('PEDIDO_YA_ASIGNADO')
      }

      // 2. Verify embarque exists and is ABIERTO
      const embarque = await tx.embarque.findUnique({ where: { id: embarqueId } })
      if (!embarque) {
        throw new Error('EMBARQUE_NOT_FOUND')
      }
      if (embarque.estado !== 'ABIERTO') {
        throw new Error('EMBARQUE_NOT_OPEN')
      }

      // 3. Atomic update: both fields in one operation
      return tx.pedido.update({
        where: { id },
        data: {
          estado: 'EN_RUTA',
          embarqueId,
        },
      })
    })

    await logAudit({
      entidad: 'Pedido',
      registroId: pedido.id,
      accion: 'UPDATE',
      datos: { numero: pedido.numero, embarqueId },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return NextResponse.json({ success: true, pedido }, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, [string, number]> = {
        PEDIDO_NOT_FOUND: ['Pedido no encontrado', 404],
        PEDIDO_NOT_PENDIENTE: ['El pedido no está en estado pendiente', 400],
        PEDIDO_YA_ASIGNADO: ['El pedido ya está asignado a un embarque', 400],
        EMBARQUE_NOT_FOUND: ['Embarque no encontrado', 404],
        EMBARQUE_NOT_OPEN: ['El embarque no está abierto', 400],
      }
      const [msg, status] = messages[error.message] || [error.message, 500]
      return NextResponse.json({ error: msg }, { status })
    }
    console.error('Error enviando pedido:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error enviando pedido' }, { status: 500 })
  }
}
