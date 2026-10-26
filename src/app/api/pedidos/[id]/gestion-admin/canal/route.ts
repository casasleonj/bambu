// TEMPORAL-SIN-EMBARQUE(#472): el administrador corrige el canal (PUNTO ↔ DOMICILIO)
// de un pedido ABIERTO. Es la "corrección formal" que el PUT de pedidos pide cuando
// el canal se registró mal. Con `vistaPrevia: true` solo calcula el impacto.
// Existe solo mientras Embarques no funciona; se apaga con
// `Config.GESTION_ADMIN_SIN_EMBARQUE` y se retira completa (ver docs).
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { CorregirCanalSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { gestionAdminSinEmbarqueActiva } from '@/lib/gestion-admin'
import { publishRealtimeEvent } from '@/lib/realtime'
import { corregirCanalPedidoUseCase } from '@/modules/pedidos'
import { CorreccionCanalError, ESTADO_HTTP_CORRECCION_CANAL } from '@/modules/pedidos/domain/services/correccion-canal.errors'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  // Solo el administrador: la oficina normal (ASISTENTE) y quien reparte quedan fuera.
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  if (!(await gestionAdminSinEmbarqueActiva())) {
    return apiError(
      'Esta función está desactivada por ahora. Consulta con el administrador del sistema.',
      403,
      { code: 'FUNCION_DESACTIVADA' },
    )
  }

  const { id } = await params
  const actorId = (authResult as { user?: { id?: string } }).user?.id
  if (!actorId) return apiError('Sesión inválida', 401)

  try {
    const parsed = CorregirCanalSchema.safeParse(await request.json())
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)
    const d = parsed.data

    const result = await corregirCanalPedidoUseCase.execute({
      pedidoId: id,
      canalNuevo: d.canal,
      precios: d.precios,
      motivo: d.motivo,
      offlineId: d.offlineId,
      actorId,
      soloVistaPrevia: d.vistaPrevia === true,
    })

    if (result.aplicado && !result.deduped) {
      publishRealtimeEvent('pedido.updated', id).catch(() => {})
    }
    return apiSuccess(result)
  } catch (error) {
    if (error instanceof CorreccionCanalError) {
      return apiError(error.message, ESTADO_HTTP_CORRECCION_CANAL[error.codigo], {
        code: error.codigo,
        ...(error.impacto ? { impacto: error.impacto } : {}),
      })
    }
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown', pedidoId: id }, 'Error corrigiendo el canal del pedido')
    return apiError('Error corrigiendo el canal del pedido', 500)
  }
}
