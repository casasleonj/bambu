import { z } from 'zod'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { validarMovimientoFisico } from '@/modules/embarques/domain/services/ledger-fisico.service'

const MovimientoSchema = z.object({
  tipo: z.enum(['REEMPAQUE', 'DESCARTE', 'CUSTODY_TRANSFER', 'AJUSTE_AUTORIZADO']),
  producto: z.string().min(1),
  cantidad: z.number().int().positive(),
  origen: z.string().optional(),
  destino: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  authorization: z.string().optional(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/embarques/[id]/movimientos — registra un movimiento físico genérico
 * del ledger (contrato §8): REEMPAQUE, DESCARTE, CUSTODY_TRANSFER o
 * AJUSTE_AUTORIZADO. `cantidad` siempre positiva; el efecto lo determina `tipo`.
 * AJUSTE_AUTORIZADO exige metadata.effect + authorization + userId.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = MovimientoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const errores = validarMovimientoFisico({
      tipo: parsed.data.tipo,
      producto: parsed.data.producto,
      cantidad: parsed.data.cantidad,
      origen: parsed.data.origen,
      destino: parsed.data.destino,
      metadata: parsed.data.metadata as { effect?: 'INCREASE' | 'DECREASE' } | undefined,
      authorization: parsed.data.authorization,
      userId: auth.user?.id,
    })
    if (errores.length > 0) {
      return apiError(errores.join('; '), 400)
    }

    const creado = await prisma.embarqueMovimiento.create({
      data: {
        embarqueId: id,
        tipo: parsed.data.tipo,
        producto: parsed.data.producto,
        cantidad: parsed.data.cantidad,
        origen: parsed.data.origen ?? null,
        destino: parsed.data.destino ?? null,
        metadata: parsed.data.metadata ? (parsed.data.metadata as unknown as Prisma.InputJsonValue) : undefined,
        authorization: parsed.data.authorization ?? null,
        userId: parsed.data.tipo === 'AJUSTE_AUTORIZADO' ? auth.user?.id ?? null : null,
        offlineId: parsed.data.offlineId ?? null,
      },
    })

    return apiSuccess({ movimiento: creado }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error registrando movimiento físico')
    return apiError('Error registrando movimiento físico', 500)
  }
}
