import { NextRequest } from 'next/server'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { EstadoEmbarque, Prisma } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { publishRealtimeEvent } from '@/lib/realtime'

// Tipo del embarque con las relaciones que necesitamos en la respuesta
type EmbarqueConRelaciones = Prisma.EmbarqueGetPayload<{
  include: { trabajador: true; ruta: true; productos: true }
}>

type EnviarResult =
  | { kind: 'not_found' }
  | { kind: 'not_abierto'; estado: EstadoEmbarque }
  | { kind: 'empty_embarque_repartidor' }
  | { kind: 'repartidor_en_ruta'; numero: number; nombre: string }
  | { kind: 'enviado'; embarque: EmbarqueConRelaciones; pedidoIds: string[] }

/**
 * POST /api/embarques/[id]/enviar
 *
 * FIX F-N1: race condition en transición ABIERTO → EN_RUTA.
 *
 * Antes: el endpoint hacía 5 operaciones auto-commit (findUnique, count,
 * findFirst, update, updateMany). Dos requests simultáneos con embarques
 * DISTINTOS pero mismo repartidor podían ambos pasar el check de "otro
 * embarque EN_RUTA" (findFirst con `id: { not: id }` no ve al otro
 * hasta que commitea). Resultado: el repartidor quedaba con DOS
 * embarques en ruta, violando la invariante de negocio.
 *
 * Ahora: toda la lógica corre dentro de una transacción Serializable
 * con retry en P2034. PostgreSQL SSI detecta el write-write conflict
 * y serializa correctamente. logAudit queda fuera (fire-and-forget).
 */
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
    const result = await executeSerializableWithRetry<EnviarResult>(
      async (tx) => {
        // 1. findUnique embarque (dentro de tx)
        const embarque = await tx.embarque.findUnique({
          where: { id },
          include: { trabajador: true },
        })

        if (!embarque) return { kind: 'not_found' }
        if (embarque.estado !== EstadoEmbarque.ABIERTO) {
          return { kind: 'not_abierto', estado: embarque.estado }
        }

        // 2. count pedidos (dentro de tx)
        const pedidosCount = await tx.pedido.count({
          where: { embarqueId: id },
        })
        const userRole = session.user?.role
        if (pedidosCount === 0 && userRole === 'REPARTIDOR') {
          return { kind: 'empty_embarque_repartidor' }
        }

        // 3. Verificar otro embarque EN_RUTA del mismo repartidor (dentro de tx)
        // FIX F-N1: ahora corre dentro de Serializable. Aunque el findFirst
        // use `id: { not: id }`, dos requests simultáneos a embarques
        // DISTINTOS del mismo repartidor NO se ven entre sí hasta que
        // uno commitea. Serializable previene la race al detectar el
        // write-write conflict.
        const embarqueEnRuta = await tx.embarque.findFirst({
          where: {
            trabajadorId: embarque.trabajadorId,
            estado: EstadoEmbarque.EN_RUTA,
            id: { not: id },
          },
        })

        if (embarqueEnRuta) {
          return {
            kind: 'repartidor_en_ruta',
            numero: embarqueEnRuta.numero,
            nombre: embarque.trabajador.nombre,
          }
        }

        // 4. update embarque → EN_RUTA
        const updated = await tx.embarque.update({
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

        // 5. updateMany pedidos → EN_RUTA
        const pedidosPendientes = await tx.pedido.findMany({
          where: { embarqueId: id, estadoEntrega: 'PENDIENTE' },
          select: { id: true },
        })
        await tx.pedido.updateMany({
          where: { embarqueId: id, estadoEntrega: 'PENDIENTE' },
          data: { estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' },
        })

        return { kind: 'enviado', embarque: updated, pedidoIds: pedidosPendientes.map((p) => p.id) }
      },
      `embarques/enviar:${id}`,
    )

    // Mapear kind-based result a HTTP response
    if (result.kind === 'not_found') return apiError('Embarque no encontrado', 404)
    if (result.kind === 'not_abierto') {
      return apiError(
        `Solo se pueden enviar embarques abiertos (estado actual: ${result.estado})`,
        400,
      )
    }
    if (result.kind === 'empty_embarque_repartidor') {
      return apiError('Solo ADMIN o ASISTENTE pueden enviar embarques sin pedidos', 403)
    }
    if (result.kind === 'repartidor_en_ruta') {
      return apiError(
        `El repartidor "${result.nombre}" ya tiene el embarque #${result.numero} en ruta. Ciérralo antes de enviar otro.`,
        400,
      )
    }

    // result.kind === 'enviado'
    const embarque = result.embarque
    logAudit({
      entidad: 'Embarque',
      registroId: id,
      accion: 'UPDATE',
      datos: { accion: 'ENVIAR_EN_RUTA', numero: embarque.numero },
      usuarioId: session.user?.id,
    }).catch(() => {})

    publishRealtimeEvent('embarque.updated', id).catch(() => {})
    result.pedidoIds.forEach((pedidoId) => {
      publishRealtimeEvent('pedido.updated', pedidoId).catch(() => {})
    })

    return apiSuccess({ embarque })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: msg }, 'Error enviando embarque:')
    return apiError('Error enviando embarque en ruta', 500)
  }
}
