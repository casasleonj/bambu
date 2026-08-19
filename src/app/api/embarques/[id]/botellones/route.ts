import { z } from 'zod'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import {
  construirMovimientoRecogidaBotellon,
  construirMovimientoEntregaBotellon,
} from '@/modules/embarques/domain/services/botellones.service'
import { validarMovimientoFisico } from '@/modules/embarques/domain/services/ledger-fisico.service'

const BotellonesSchema = z.object({
  accion: z.enum(['RECOGIDA', 'ENTREGA']),
  cantidad: z.number().int().positive(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/embarques/[id]/botellones — registra recogida o entrega de
 * botellones como movimientos físicos SEPARADOS (contrato §16): recogido ≠
 * entregado; no se transforma automáticamente una recogida en una entrega.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = BotellonesSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const movimiento =
      parsed.data.accion === 'RECOGIDA'
        ? construirMovimientoRecogidaBotellon({ cantidad: parsed.data.cantidad })
        : construirMovimientoEntregaBotellon({ cantidad: parsed.data.cantidad })

    const errores = validarMovimientoFisico(movimiento)
    if (errores.length > 0) {
      return apiError(errores.join('; '), 400)
    }

    // Idempotencia (ADR-IDEMPOTENCIA-001, contrato §14): un retry con el
    // mismo offlineId debe devolver el resultado ya creado, no un 500 por
    // violación del constraint único de offlineId.
    if (parsed.data.offlineId) {
      const existente = await prisma.embarqueMovimiento.findUnique({
        where: { offlineId: parsed.data.offlineId },
      })
      if (existente) {
        return apiSuccess({ movimiento: existente, deduped: true })
      }
    }

    const creado = await prisma.embarqueMovimiento.create({
      data: {
        embarqueId: id,
        tipo: movimiento.tipo,
        producto: movimiento.producto,
        cantidad: movimiento.cantidad,
        origen: movimiento.origen ?? null,
        destino: movimiento.destino ?? null,
        metadata: movimiento.metadata ? (movimiento.metadata as unknown as Prisma.InputJsonValue) : undefined,
        offlineId: parsed.data.offlineId ?? null,
      },
    })

    return apiSuccess({ movimiento: creado }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error registrando botellones')
    return apiError('Error registrando botellones', 500)
  }
}
