// TEMPORAL-SIN-EMBARQUE(#472): el administrador registra la entrega de un pedido
// SIN pasar por un embarque (quién repartió, cuándo, cuánto se recibió). Existe
// solo mientras la sección de Embarques no funciona; se apaga con
// `Config.GESTION_ADMIN_SIN_EMBARQUE` y se retira completa (ver docs).
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { EntregaOficinaSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { gestionAdminSinEmbarqueActiva } from '@/lib/gestion-admin'
import { publishRealtimeEvent } from '@/lib/realtime'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { NotificationEventType } from '@/lib/notifications/event-types'
import { sendPushToUser } from '@/lib/push'
import { shouldFireCulminado } from '@/lib/pedido-utils'
import { startOfDayBogota } from '@/lib/dates'
import { entregarPedidoUseCase } from '@/modules/pedidos'
import { EntregaOficinaError, ESTADO_HTTP_OFICINA } from '@/modules/pedidos/domain/services/entrega-oficina.errors'

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
    const parsed = EntregaOficinaSchema.safeParse(await request.json())
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)
    const d = parsed.data

    const fechaEntrega = d.fechaEntrega ? new Date(d.fechaEntrega) : new Date()
    const unidades = d.itemsEntregados.reduce((s, i) => s + i.cantidad, 0)
    if (unidades <= 0) {
      return apiError('Indica cuántas unidades se entregaron.', 422, { code: 'SIN_UNIDADES' })
    }

    const result = await entregarPedidoUseCase.execute({
      pedidoId: id,
      actorId,
      itemsEntregados: d.itemsEntregados.map((i) => ({
        producto: i.producto as import('@/shared/domain').ProductCode,
        cantidad: i.cantidad,
      })),
      pagos: (d.pagos ?? []).map((p) => ({
        metodo: p.metodo as import('@/modules/pedidos/domain/types').MetodoPago,
        monto: p.monto,
      })),
      offlineId: d.offlineId,
      oficina: {
        repartidorId: d.repartidorId,
        recibioDinero: d.recibioDinero,
        fechaEntrega,
        // Clientes anteriores elegían solo fecha y enviaban mediodía convencional.
        precisionFecha: d.precisionFecha ?? (d.fechaEntrega ? 'DIA' : 'INSTANTE'),
        nota: d.nota,
        promesaPagoFecha: d.promesaPagoFecha ? startOfDayBogota(d.promesaPagoFecha) : undefined,
      },
    })

    publishRealtimeEvent('pedido.updated', id).catch(() => {})
    if (result.embarqueLiberadoId) {
      publishRealtimeEvent('embarque.updated', result.embarqueLiberadoId).catch(() => {})
      void (async () => {
        const emb = await prisma.embarque
          .findUnique({
            where: { id: result.embarqueLiberadoId },
            select: { estado: true, numero: true, trabajador: { select: { userId: true } } },
          })
          .catch(() => null)
        const repartidorUserId = emb?.trabajador?.userId
        if (emb?.estado === 'EN_RUTA' && repartidorUserId) {
          void sendPushToUser(repartidorUserId, {
            title: 'Pedido entregado desde la oficina',
            body: `El pedido #${result.pedido.numero} se registró desde la oficina; sale del embarque #${emb.numero}.`,
            url: '/repartidor',
            tag: `embarque-ruta-modificado-${result.embarqueLiberadoId}`,
          })
        }
      })()
    }

    if (!result.deduped && result.pedido.estadoEntrega === 'ENTREGADO') {
      void notifyEvent(NotificationEventType.PEDIDO_ENTREGADO, {
        title: 'Pedido entregado',
        body: `Pedido #${result.pedido.numero} fue entregado.`,
        url: `/pedidos?openPedido=${result.pedido.id}`,
        tag: `pedido-entregado-${result.pedido.id}`,
      })
      if (shouldFireCulminado(result.pedido.estadoEntrega, result.pedido.estadoPago)) {
        void notifyEvent(NotificationEventType.PEDIDO_CULMINADO, {
          title: 'Pedido culminado',
          body: `Pedido #${result.pedido.numero} fue entregado y pagado en su totalidad.`,
          url: `/pedidos?openPedido=${result.pedido.id}`,
          tag: `pedido-culminado-${result.pedido.id}`,
        })
      }
    }

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof EntregaOficinaError) {
      return apiError(error.message, ESTADO_HTTP_OFICINA[error.codigo], { code: error.codigo })
    }
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    if (error instanceof Error && error.message === 'TRANSICION_INVALIDA') {
      return apiError('Este pedido ya no se puede entregar (está cerrado o cancelado). Actualiza la pantalla.', 409, { code: 'TRANSICION_INVALIDA' })
    }
    if (error instanceof Error && error.message.includes('excede el saldo del pedido')) {
      return apiError('El dinero recibido es mayor que lo que se debe. Revisa el monto.', 422, { code: 'PAGO_EXCEDE_SALDO' })
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown', pedidoId: id }, 'Error en entrega de oficina')
    return apiError('No se pudo registrar la entrega. Intenta de nuevo.', 500)
  }
}
