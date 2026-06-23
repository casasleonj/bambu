/**
 * POST /api/pedidos/[id]/resolver-disputa
 *
 * Cierra la disputa de un pedido de forma SEGURA (Hallazgo 2 del
 * plan antifraude): solo ADMIN o ASISTENTE pueden ejecutarlo.
 *
 * Antes, cualquier usuario autenticado con acceso al pedido (incluido
 * el REPARTIDOR que origino la disputa) podia cerrar su propia
 * disputa via PATCH /api/pedidos/[id] con `disputaAbierta: false`.
 * Vector de fraude: el repartidor origina una disputa para borrar
 * evidencia y luego la cierra sin supervision.
 *
 * Body (opcional):
 *   { casoId?: string }  // para vincular al Caso que origino la resolucion
 *
 * Auth: requireAuth + requireRole([ADMIN, ASISTENTE]).
 *
 * Comportamiento:
 *   - Verifica que el pedido existe (404 si no)
 *   - Si la disputa ya estaba cerrada, retorna 200 idempotente
 *   - Cierra la disputa (disputaAbierta=false)
 *   - Log audit con casoId si se provee
 *   - Pasa casoId al logAudit (commit 0e) para que aparezca en
 *     la timeline del caso en /casos/[id]
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'

const BodySchema = z
  .object({
    casoId: z.string().min(1).optional(),
  })
  .optional()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth + role check
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('No autorizado', 401)

  // 2. Body opcional
  const { id: pedidoId } = await params
  let casoId: string | null = null
  try {
    const raw = await request.json()
    const parsed = BodySchema.safeParse(raw)
    if (parsed.success && parsed.data?.casoId) {
      casoId = parsed.data.casoId
    }
  } catch {
    // body vacio o invalido: OK, casoId queda null
  }

  try {
    // 3. Verificar que el pedido existe
    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { id: true, disputaAbierta: true, numero: true },
    })
    if (!pedido) return apiError('Pedido no encontrado', 404)

    // 4. Idempotencia: si ya estaba cerrada, 200 sin cambios
    if (!pedido.disputaAbierta) {
      return apiSuccess({
        pedido: { id: pedido.id, numero: pedido.numero, disputaAbierta: false },
        yaCerrada: true,
      })
    }

    // 5. Cerrar la disputa
    const updated = await prisma.pedido.update({
      where: { id: pedidoId },
      data: { disputaAbierta: false },
      select: { id: true, numero: true, disputaAbierta: true },
    })

    // 6. Audit log (con casoId si se provee, commit 0e)
    logAudit({
      entidad: 'Pedido',
      registroId: pedidoId,
      accion: 'UPDATE',
      datos: {
        cambio: 'disputaAbierta',
        valorAnterior: true,
        valorNuevo: false,
        pedidoNumero: pedido.numero,
        origen: 'resolver-disputa-endpoint',
      },
      usuarioId: userId,
      casoId,
    }).catch(() => {})

    logger.info(
      { pedidoId, pedidoNumero: pedido.numero, casoId, userId },
      '[disputa] cerrada via endpoint seguro',
    )

    publishRealtimeEvent('pedido.updated', pedidoId).catch(() => {})

    return apiSuccess({
      pedido: updated,
      yaCerrada: false,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: errMsg, pedidoId }, '[disputa] error cerrando')
    return apiError('Error cerrando disputa', 500)
  }
}
