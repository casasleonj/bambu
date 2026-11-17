import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { corregirFechaRealPagoComision, CorreccionFechaComisionError } from '@/lib/pago-comision-fecha-correccion'

const CorregirFechaSchema = z.object({
  /** Día en que realmente salió el dinero, YYYY-MM-DD (Bogotá). */
  fechaPagoReal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD'),
  motivo: z.string().max(500),
  offlineId: z.string().min(8).max(100).optional(),
})

/**
 * POST /api/nomina/pagos-comision/[id]/corregir-fecha — corrige el día REAL de caja (`fechaPagoReal`) de un pago de comisión (#834).
 * Solo ADMIN, con motivo obligatorio y rastro que solo añade filas. No toca `createdAt` ni el día trabajado. Un día ya cerrado no
 * se bloquea ni se reescribe: la respuesta lista `diasCerrados` y ese cierre conserva su cifra guardada.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const body = await request.json().catch(() => null)
    const parsed = CorregirFechaSchema.safeParse(body)
    if (!parsed.success) return apiError(formatZodError(parsed.error), 422, { code: 'FECHA_PAGO_INVALIDA' })

    const result = await corregirFechaRealPagoComision({
      pagoId: id,
      fechaPagoReal: parsed.data.fechaPagoReal,
      motivo: parsed.data.motivo,
      actorId: auth.user?.id ?? '',
      actorRol: auth.user?.role ?? '',
      offlineId: parsed.data.offlineId,
    })
    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof CorreccionFechaComisionError) return apiError(error.message, error.status, { code: error.code })
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error corrigiendo el día de caja de un pago de comisión')
    return apiError('Error al corregir el día de caja del pago', 500)
  }
}
