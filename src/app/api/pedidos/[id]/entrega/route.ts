import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { EntregaSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { entregarPedidoUseCase } from '@/modules/pedidos'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = EntregaSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { tipo, itemsEntregados, pagos, fotoEntrega, gpsLat, gpsLng, codigoVisita } = parsed.data

    // Build items for delivery
    const entregas = (itemsEntregados || []).map((ie: { producto: string; cantidad: number }) => ({
      producto: ie.producto as import('@/shared/domain').ProductCode,
      cantidad: ie.cantidad,
    }))

    // Build payments
    const pagosInput = (pagos || []).map((p: { metodo: string; monto: number }) => ({
      metodo: p.metodo as import('@/modules/pedidos/domain/types').MetodoPago,
      monto: p.monto,
    }))

    const result = await entregarPedidoUseCase.execute({
      pedidoId: id,
      itemsEntregados: entregas,
      pagos: pagosInput,
      fotoEntrega,
      gpsLat,
      gpsLng,
      codigoVisita,
    })

    logAudit({
      entidad: 'Pedido',
      registroId: id,
      accion: 'UPDATE',
      datos: { accion: 'ENTREGA', tipo, estadoEntrega: result.pedido.estadoEntrega, estadoPago: result.pedido.estadoPago },
      usuarioId: (authResult as { user?: { id?: string } }).user?.id,
    })

    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido no encontrado', 404)
    }
    if (error instanceof Error && error.message === 'TRANSICION_INVALIDA') {
      return apiError('Transición de estado no permitida', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error registrando entrega:')
    return apiError('Error registrando entrega')
  }
}
