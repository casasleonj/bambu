import { z } from 'zod'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { validarPromocion } from '@/modules/embarques/domain/services/promocion.service'
import { validarMovimientoFisico } from '@/modules/embarques/domain/services/ledger-fisico.service'

const PromocionSchema = z.object({
  nombre: z.string().min(1),
  producto: z.string().min(1),
  cantidad: z.number().int().positive(),
  embarqueId: z.string().optional(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/promociones — crea una regla de promoción/regalo (contrato §17).
 * Exige autorización auditable (autorizadoPorId) y, si se indica embarqueId,
 * registra el consumo en el ledger físico (EmbarqueMovimiento tipo PROMOCION)
 * exactamente una vez (offlineId @unique).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN], auth)
  if (role instanceof Response) return role

  try {
    const body = await request.json()
    const parsed = PromocionSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const autorizadoPorId = auth.user?.id ?? ''

    const errores = validarPromocion({
      producto: parsed.data.producto,
      cantidad: parsed.data.cantidad,
      autorizadoPorId,
    })
    if (errores.length > 0) {
      return apiError(errores.join('; '), 400)
    }

    const promocion = await prisma.$transaction(async (tx) => {
      const regla = await tx.promotionRule.create({
        data: {
          nombre: parsed.data.nombre,
          producto: parsed.data.producto,
          cantidad: parsed.data.cantidad,
          autorizadoPorId,
          offlineId: parsed.data.offlineId ?? null,
        },
      })

      // Consumo en el ledger físico (contrato §17): la promoción consume
      // inventario aunque el precio comercial sea cero. No es un cobro ficticio.
      if (parsed.data.embarqueId) {
        const movimiento = {
          tipo: 'PROMOCION' as const,
          producto: parsed.data.producto,
          cantidad: parsed.data.cantidad,
          origen: 'VEHICULO',
          destino: 'CLIENTE',
          metadata: { promotionRuleId: regla.id },
        }
        const erroresMov = validarMovimientoFisico(movimiento)
        if (erroresMov.length === 0) {
          await tx.embarqueMovimiento.create({
            data: {
              embarqueId: parsed.data.embarqueId,
              tipo: 'PROMOCION',
              producto: parsed.data.producto,
              cantidad: parsed.data.cantidad,
              origen: 'VEHICULO',
              destino: 'CLIENTE',
              metadata: { promotionRuleId: regla.id },
              offlineId: parsed.data.offlineId ?? null,
            },
          })
        }
      }

      return regla
    })

    return apiSuccess({ promocion }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creando promoción')
    return apiError('Error creando promoción', 500)
  }
}

/** GET /api/promociones — lista las reglas de promoción activas. */
export async function GET(_request: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role

  try {
    const promociones = await prisma.promotionRule.findMany({
      where: { activo: true },
      orderBy: { createdAt: 'desc' },
    })
    return apiSuccess({ promociones })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error listando promociones')
    return apiError('Error listando promociones', 500)
  }
}
