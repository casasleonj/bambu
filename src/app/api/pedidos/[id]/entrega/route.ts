import { generateUUID } from '@/lib/uuid'
import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { EntregaSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { entregarPedidoUseCase } from '@/modules/pedidos'
import { getConfigBool } from '@/lib/config'
import { uploadBase64Foto, isBase64Image } from '@/lib/storage'

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

    const { tipo, itemsEntregados, pagos, fotoEntrega, gpsLat, gpsLng, codigoVisita, offlineId } = parsed.data

    // Rule: REQUIERE_FOTO_ENTREGA
    // Applies to:
    //   - REPARTIDOR
    //   - Any Trabajador with usaMoto=true (look up by userId)
    //   - ADMIN (any admin user) when the toggle is active
    const requiereFoto = await getConfigBool('REQUIERE_FOTO_ENTREGA', false)
    if (requiereFoto) {
      const user = (authResult as { user?: { id?: string; role?: string } }).user
      let requiresForThisUser = false
      if (user?.role === 'REPARTIDOR' || user?.role === 'ADMIN') {
        requiresForThisUser = true
      } else {
        // Look up the associated Trabajador by userId
        const trabajador = await prisma.trabajador.findFirst({
          where: { userId: user?.id },
          select: { usaMoto: true },
        })
        if (trabajador?.usaMoto) {
          requiresForThisUser = true
        }
      }
      if (requiresForThisUser && !fotoEntrega) {
        return apiError('La foto de entrega es obligatoria para repartidores, administradores y trabajadores con moto', 400)
      }
    }

    // Offline-first: dedup — si el pedido ya está ENTREGADO, retornar OK
    const pedidoActual = await prisma.pedido.findUnique({
      where: { id },
      select: { estadoEntrega: true },
    })
    if (pedidoActual?.estadoEntrega === 'ENTREGADO') {
      return apiSuccess({ deduped: true, pedido: { id, estadoEntrega: 'ENTREGADO' } }, 200)
    }

    // Upload base64 foto to Supabase Storage (same as venta-libre).
    // If upload fails or Supabase is not configured, we fall back to the base64 string
    // so the foto is at least persisted (better than losing the evidence).
    let fotoUrl: string | undefined = fotoEntrega
    if (fotoEntrega && isBase64Image(fotoEntrega)) {
      const fileName = `entrega/${id}/${offlineId || generateUUID()}.jpg`
      const uploadedUrl = await uploadBase64Foto(fotoEntrega, fileName)
      if (uploadedUrl) {
        fotoUrl = uploadedUrl
      } else {
        logger.warn({ pedidoId: id }, 'Foto upload failed, persisting base64 as fallback')
      }
    }

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
      fotoEntrega: fotoUrl,
      gpsLat,
      gpsLng,
      codigoVisita,
      offlineId,
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
