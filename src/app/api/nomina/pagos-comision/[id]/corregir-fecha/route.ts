import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { corregirFechaPagoComision, CorreccionFechaComisionError } from '@/lib/pago-comision-fecha-correccion'

const CorregirFechaSchema = z.object({
  /** Día en que realmente salió el dinero, YYYY-MM-DD (Bogotá). */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD'),
  motivo: z.string().max(500),
  offlineId: z.string().max(100).optional(),
})

/**
 * POST /api/nomina/pagos-comision/[id]/corregir-fecha — corrige la fecha EFECTIVA de caja de un pago de comisión (#673).
 * Solo ADMIN, con motivo obligatorio y rastro append-only. `createdAt` (captura) y `fecha` (día del trabajo) nunca cambian.
 * Un día ya cerrado no se bloquea ni se reescribe: conserva su cifra y V16 ve el pago como explicado por esta corrección.
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
    if (!parsed.success) return apiError(formatZodError(parsed.error), 422)

    const result = await corregirFechaPagoComision({
      pagoId: id,
      fecha: parsed.data.fecha,
      motivo: parsed.data.motivo,
      actorId: auth.user?.id ?? '',
      actorRol: auth.user?.role ?? '',
      offlineId: parsed.data.offlineId,
    })
    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof CorreccionFechaComisionError) return apiError(error.message, error.status, { code: error.code })
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error corrigiendo la fecha de caja de un pago de comisión')
    return apiError('Error al corregir la fecha del pago', 500)
  }
}
