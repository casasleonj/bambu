import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { corregirFechaPago } from '@/lib/pago-fecha-correccion-server'
import { CorreccionFechaPagoError } from '@/lib/pago-fecha-correccion'

const CorregirFechaSchema = z.object({
  /** Día en que realmente se cobró, YYYY-MM-DD (Bogotá). */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD'),
  motivo: z.string().max(500),
  offlineId: z.string().max(100).optional(),
})

/**
 * POST /api/pagos/[id]/corregir-fecha — corrige la fecha EFECTIVA de un cobro (#617).
 * Solo ADMIN, con motivo obligatorio y rastro append-only. `Pago.createdAt` (registro) nunca cambia: no mueve dinero
 * entre cierres. Si la fecha actual o la nueva cae en un día ya cerrado, responde 409 `DIA_CERRADO`: eso se rectifica
 * con una regularización formal (#402).
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
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)

    const result = await corregirFechaPago({
      pagoId: id,
      fecha: parsed.data.fecha,
      motivo: parsed.data.motivo,
      actorId: auth.user?.id ?? '',
      actorRol: auth.user?.role ?? '',
      offlineId: parsed.data.offlineId,
    })
    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof CorreccionFechaPagoError) return apiError(error.message, error.status, { code: error.code })
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error corrigiendo la fecha de un pago')
    return apiError('Error al corregir la fecha del cobro', 500)
  }
}
