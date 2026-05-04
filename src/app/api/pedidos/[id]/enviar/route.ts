import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { calcularPacasEmbarque } from '@/lib/embarque-capacidad'
import { logger } from '@/lib/logger'

const EnviarPedidoSchema = z.object({
  embarqueId: z.string().min(1),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = EnviarPedidoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }

    const { embarqueId } = parsed.data

    const pedido = await prisma.$transaction(async (tx) => {
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

      const embarque = await tx.embarque.findUnique({
        where: { id: embarqueId },
        include: { pedidos: true },
      })
      if (!embarque) {
        throw new Error('EMBARQUE_NOT_FOUND')
      }
      if (embarque.estado !== 'ABIERTO') {
        throw new Error('EMBARQUE_NOT_OPEN')
      }

      const pacasActuales = calcularPacasEmbarque(embarque.pedidos)
      const pacasPedido =
        (current.cPacaAguaPed || 0) +
        (current.cPacaHieloPed || 0) +
        (current.cBotellonFabPed || 0) +
        (current.cBotellonDomPed || 0) +
        (current.cBolsaAguaPed || 0) +
        (current.cBolsaHieloPed || 0)

      if (pacasActuales + pacasPedido > 70) {
        throw new Error('EMBARQUE_CAPACIDAD_EXCEDIDA')
      }

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
        EMBARQUE_CAPACIDAD_EXCEDIDA: ['El embarque no tiene capacidad suficiente (máx 70 pacas)', 400],
      }
      const [msg, status] = messages[error.message] || ['Error enviando pedido', 500]
      return NextResponse.json({ error: msg }, { status })
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error enviando pedido:')
    return NextResponse.json({ error: 'Error enviando pedido' }, { status: 500 })
  }
}
