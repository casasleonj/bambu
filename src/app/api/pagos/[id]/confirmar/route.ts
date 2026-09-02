import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { getConfig } from '@/lib/config'
import { ConfirmarPagoSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { withAdvisoryLock } from '@/lib/locks'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'
import { incrementMetric } from '@/lib/metrics'

/**
 * POST /api/pagos/[id]/confirmar — ADR-PAGO-REPORTADO-CONFIRMADO-001 §3–§4.
 *
 * El usuario designado (`Config.USUARIO_CONFIRMA_PAGOS`) marca un `Pago`
 * `REPORTADO` como `CONFIRMADO` (el dinero entró) o `DISCREPANTE` (no entró /
 * entró distinto). `DISCREPANTE` NO revierte el Pago (P4) — abre un
 * `ResponsibilityCase PAGO_NO_CONFIRMADO` con la nota de investigación.
 *
 * Idempotente por estado: si ya está CONFIRMADO/DISCREPANTE → `deduped: true` (200).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = (authResult.user as { id?: string } | undefined)?.id

  const confirmador = await getConfig('USUARIO_CONFIRMA_PAGOS')
  if (!confirmador || confirmador !== userId) {
    return apiError('Solo el usuario designado para confirmar pagos puede confirmarlos', 403)
  }

  const { id: pagoId } = await params

  try {
    const body = await request.json()
    const parsed = ConfirmarPagoSchema.safeParse(body)
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)
    const { resultado, nota } = parsed.data

    const pagoPre = await prisma.pago.findUnique({
      where: { id: pagoId },
      select: { pedido: { select: { id: true } } },
    })
    if (!pagoPre) return apiError('Pago no encontrado', 404)

    const result = await withAdvisoryLock('PEDIDO', pagoPre.pedido.id, async (tx) => {
      const pago = await tx.pago.findUnique({
        where: { id: pagoId },
        include: { pedido: { select: { id: true, numero: true, clienteId: true } } },
      })
      if (!pago) throw new Error('PAGO_NOT_FOUND')

      // Idempotente por estado.
      if (pago.confirmacion !== 'REPORTADO') {
        return { pago, deduped: true as const, responsibilityCaseId: null as string | null }
      }

      let responsibilityCaseId: string | null = null
      if (resultado === 'DISCREPANTE') {
        const caso = await tx.responsibilityCase.create({
          data: {
            tipo: 'PAGO_NO_CONFIRMADO',
            descripcion: `Pago ${pago.metodo} de ${Number(pago.monto)} (pedido #${pago.pedido.numero}) reportado como NO recibido. ${nota}`,
            montoEstimado: Number(pago.monto),
            clienteId: pago.pedido.clienteId,
          },
        })
        responsibilityCaseId = caso.id
        incrementMetric('pago_discrepante_count')
      }

      const updated = await tx.pago.update({
        where: { id: pagoId },
        data: {
          confirmacion: resultado,
          confirmadoPorId: userId,
          confirmadoAt: new Date(),
        },
        include: { pedido: { select: { id: true, numero: true, clienteId: true } } },
      })

      await logAudit(
        {
          entidad: 'Pago',
          registroId: pagoId,
          accion: 'UPDATE',
          datos: { accion: 'CONFIRMACION', resultado, nota: nota ?? null, responsibilityCaseId },
          usuarioId: userId,
        },
        tx,
      )

      return { pago: updated, deduped: false as const, responsibilityCaseId }
    })

    if (!result.deduped) {
      publishRealtimeEvent('pago.created', result.pago.pedido.clienteId).catch(() => {})
      publishRealtimeEvent('pedido.updated', result.pago.pedido.id).catch(() => {})
    }

    return apiSuccess(
      {
        pago: { ...result.pago, monto: Number(result.pago.monto) },
        ...(result.responsibilityCaseId ? { responsibilityCaseId: result.responsibilityCaseId } : {}),
        ...(result.deduped ? { deduped: true } : {}),
      },
      result.deduped ? 200 : 201,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    if (msg === 'PAGO_NOT_FOUND') return apiError('Pago no encontrado', 404)
    logger.error({ err: msg, pagoId }, 'Error confirmando pago')
    return apiError('Error confirmando el pago', 500)
  }
}
