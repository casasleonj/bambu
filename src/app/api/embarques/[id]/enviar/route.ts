import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { EstadoEmbarque } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  try {
    const embarque = await prisma.embarque.findUnique({
      where: { id },
      include: { trabajador: true },
    })

    if (!embarque) return apiError('Embarque no encontrado', 404)
    if (embarque.estado !== EstadoEmbarque.ABIERTO) {
      return apiError('Solo se pueden enviar embarques abiertos', 400)
    }

    // FIX #8 modificado: embarques vacíos solo ADMIN/ASISTENTE
    const pedidosCount = await prisma.pedido.count({
      where: { embarqueId: id },
    })
    const userRole = (authResult as { user?: { role?: string } }).user?.role
    if (pedidosCount === 0 && userRole === 'REPARTIDOR') {
      return apiError('Solo ADMIN o ASISTENTE pueden enviar embarques sin pedidos', 403)
    }

    // Verificar que el repartidor no tenga otro embarque EN_RUTA
    const embarqueEnRuta = await prisma.embarque.findFirst({
      where: {
        trabajadorId: embarque.trabajadorId,
        estado: EstadoEmbarque.EN_RUTA,
        id: { not: id },
      },
    })

    if (embarqueEnRuta) {
      return apiError(
        `El repartidor "${embarque.trabajador.nombre}" ya tiene el embarque #${embarqueEnRuta.numero} en ruta. Ciérralo antes de enviar otro.`,
        400
      )
    }

    const updated = await prisma.embarque.update({
      where: { id },
      data: {
        estado: EstadoEmbarque.EN_RUTA,
        horaSalida: embarque.horaSalida || new Date(),
      },
      include: {
        trabajador: true,
        ruta: true,
        productos: true,
      },
    })

    await prisma.pedido.updateMany({
      where: { embarqueId: id, estadoEntrega: 'PENDIENTE' },
      data: { estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' },
    })

    logAudit({
      entidad: 'Embarque',
      registroId: id,
      accion: 'UPDATE',
      datos: { accion: 'ENVIAR_EN_RUTA', numero: embarque.numero },
      usuarioId: (authResult as { user?: { id?: string } }).user?.id,
    })

    return apiSuccess({ embarque: updated })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error enviando embarque:')
    return apiError('Error enviando embarque en ruta')
  }
}
