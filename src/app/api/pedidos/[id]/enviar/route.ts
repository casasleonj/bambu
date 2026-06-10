import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { calcularPesoEmbarque } from '@/lib/embarque-capacidad'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

const EnviarPedidoSchema = z.object({
  embarqueId: z.string().min(1),
  // Offline-first: dedup si la request se encola y se reintenta
  offlineId: z.string().optional(),
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
      return apiError(formatZodError(parsed.error), 400)
    }

    const { embarqueId, offlineId } = parsed.data

    // FIX Fase 1: dedup robusto. Antes este check era por estado
    // (embarqueId+EN_RUTA) y se hacía FUERA de la tx con prisma.* global.
    // Dos requests idénticos podían pasar el check antes de que cualquiera
    // entrara a la tx, y el segundo recibía 400 'PEDIDO_YA_ASIGNADO' o
    // 'PEDIDO_NOT_PENDIENTE' en vez de un dedup idempotente.
    //
    // Ahora: el dedup se hace DENTRO de la tx por `envioOfflineId`
    // (campo único, persistente). Si la request ya fue procesada, el
    // server retorna el pedido actual con deduped: true.
    type EnviarResult =
      | { deduped: true; pedidoId: string; embarqueId: string | null; estadoEntrega: string; numero: number }
      | { deduped: false; pedidoId: string; embarqueId: string | null; estadoEntrega: string; numero: number }

    const result: EnviarResult = await prisma.$transaction(async (tx) => {
      const current = await tx.pedido.findUnique({
        where: { id },
        select: {
          id: true,
          estado: true,
          embarqueId: true,
          estadoEntrega: true,
          envioOfflineId: true,
          numero: true,
          // Necesarios para el cálculo de peso
          cPacaAguaPed: true,
          cPacaHieloPed: true,
          cBotellonFabPed: true,
          cBotellonDomPed: true,
          cBolsaAguaPed: true,
          cBolsaHieloPed: true,
        },
      })
      if (!current) {
        throw new Error('PEDIDO_NOT_FOUND')
      }

      // Dedup DENTRO de la tx
      if (offlineId && current.envioOfflineId === offlineId) {
        return {
          deduped: true as const,
          pedidoId: current.id,
          embarqueId: current.embarqueId,
          estadoEntrega: current.estadoEntrega,
          numero: current.numero,
        }
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
      if (embarque.estado === 'CERRADO' || embarque.estado === 'CANCELADO') {
        throw new Error('EMBARQUE_NOT_OPEN')
      }

      const pesoActual = calcularPesoEmbarque(embarque.pedidos)

      const embarqueData = await tx.trabajador.findUnique({
        where: { id: embarque.trabajadorId },
        select: { capacidadKg: true },
      })

      const pesoPedido =
        (current.cPacaAguaPed || 0) * 10.0 +
        (current.cPacaHieloPed || 0) * 11.0 +
        (current.cBotellonFabPed || 0) * 20.0 +
        (current.cBotellonDomPed || 0) * 20.0 +
        (current.cBolsaAguaPed || 0) * 0.25 +
        (current.cBolsaHieloPed || 0) * 0.55

      const capacidadKg = embarqueData?.capacidadKg || 500
      if (pesoActual + pesoPedido > capacidadKg) {
        throw new Error('EMBARQUE_CAPACIDAD_EXCEDIDA')
      }

      const updated = await tx.pedido.update({
        where: { id },
        data: {
          estado: 'EN_RUTA',
          estadoEntrega: 'EN_RUTA',
          embarqueId,
          // Persistir offlineId para dedup en retries (offline-first)
          ...(offlineId ? { envioOfflineId: offlineId } : {}),
        },
        select: { id: true, embarqueId: true, estadoEntrega: true, numero: true },
      })

      return {
        deduped: false as const,
        pedidoId: updated.id,
        embarqueId: updated.embarqueId,
        estadoEntrega: updated.estadoEntrega,
        numero: updated.numero,
      }
    })

    // FIX Fase 1: respuesta explícita para el caso deduped
    if (result.deduped) {
      return apiSuccess(
        {
          deduped: true,
          pedido: {
            id: result.pedidoId,
            embarqueId: result.embarqueId,
            estadoEntrega: result.estadoEntrega,
          },
        },
        200,
      )
    }

    logAudit({
      entidad: 'Pedido',
      registroId: result.pedidoId,
      accion: 'UPDATE',
      datos: { numero: result.numero, embarqueId },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess(
      {
        pedido: {
          id: result.pedidoId,
          embarqueId: result.embarqueId,
          estadoEntrega: result.estadoEntrega,
        },
      },
      201,
    )
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, [string, number]> = {
        PEDIDO_NOT_FOUND: ['Pedido no encontrado', 404],
        PEDIDO_NOT_PENDIENTE: ['El pedido no está en estado pendiente', 400],
        PEDIDO_YA_ASIGNADO: ['El pedido ya está asignado a un embarque', 400],
        EMBARQUE_NOT_FOUND: ['Embarque no encontrado', 404],
        EMBARQUE_NOT_OPEN: ['El embarque no está abierto', 400],
        EMBARQUE_CAPACIDAD_EXCEDIDA: ['El embarque excede la capacidad de carga', 400],
      }
      const [msg, status] = messages[error.message] || ['Error enviando pedido', 500]
      return apiError(msg, status)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error enviando pedido:')
    return apiError('Error enviando pedido', 500)
  }
}
