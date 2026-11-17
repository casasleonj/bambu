import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import {
  ReprogramarPedidoUseCase,
  PedidoFechaCambioConcurrenteError,
} from '@/modules/pedidos/application/use-cases/ReprogramarPedidoUseCase'

const ReprogramarSchema = z.object({
  fechaNueva: z.string().datetime(),
  motivo: z.string().trim().max(500).optional(),
  offlineId: z.string().optional(),
  /** Fecha que la pantalla veía (ISO) o null si veía «sin fecha». Omitir = no comprobar. */
  fechaAnteriorEsperada: z.string().datetime().nullable().optional(),
})

/**
 * POST /api/pedidos/[id]/reprogramar — #836 F1. Cambia la fecha PROMETIDA del pedido con
 * historial. No cambia creación, entrega física, importes ni pagos. Mismos roles que la
 * gestión de pendientes (ADMIN/ASISTENTE); no es una autorización financiera.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const actorId = role.user?.id
  if (!actorId) return apiError('No autorizado', 401)

  const { id } = await params
  try {
    const parsed = ReprogramarSchema.safeParse(await request.json())
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)

    const result = await new ReprogramarPedidoUseCase().execute({
      pedidoId: id,
      fechaNueva: new Date(parsed.data.fechaNueva),
      actorId,
      motivo: parsed.data.motivo || undefined,
      offlineId: parsed.data.offlineId,
      fechaAnteriorEsperada:
        parsed.data.fechaAnteriorEsperada === undefined
          ? undefined
          : parsed.data.fechaAnteriorEsperada === null
            ? null
            : new Date(parsed.data.fechaAnteriorEsperada),
    })
    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof PedidoFechaCambioConcurrenteError) {
      return apiError('Otra persona cambió la fecha de este pedido. Revisa la fecha actual y vuelve a confirmar.', 409)
    }
    if (error instanceof Error) {
      if (error.message.startsWith('PEDIDO_NOT_FOUND')) return apiError('Pedido no encontrado', 404)
      if (error.message.startsWith('PEDIDO_NO_REPROGRAMABLE')) return apiError(error.message, 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error reprogramando pedido')
    return apiError('Error reprogramando pedido', 500)
  }
}
