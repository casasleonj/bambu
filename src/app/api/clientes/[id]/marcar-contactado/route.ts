/**
 * POST /api/clientes/[id]/marcar-contactado
 *
 * Registra que se contactó al cliente (llamada, WhatsApp, etc).
 * Resetea `ultimaLlamada` y baja `scoreLlamada` (pero NO lo pone en 0 —
 * sigue acumulando atraso para futuras llamadas).
 *
 * Auth: ADMIN, ASISTENTE.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'

const BodySchema = z.object({
  /** Notas opcionales (ej. "Cliente dice que pidió mañana"). */
  notas: z.string().max(500).optional(),
  /** Si se pasó un pedido después de la llamada. */
  generoPedido: z.boolean().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params

  let body: z.infer<typeof BodySchema> = {}
  try {
    const raw = await request.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) {
      return apiError('Body inválido', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    body = parsed.data
  } catch {
    // body vacío OK
  }

  try {
    const cliente = await prisma.cliente.findUnique({ where: { id }, select: { id: true } })
    if (!cliente) return apiError('Cliente no encontrado', 404)

    await prisma.cliente.update({
      where: { id },
      data: {
        ultimaLlamada: new Date(),
        // NO reseteamos diasAtraso ni scoreLlamada. Si el cliente
        // no pidió después de la llamada, sigue acumulando para
        // recordatorios futuros.
      },
    })

    await logAudit({
      entidad: 'Cliente',
      registroId: id,
      accion: 'UPDATE',
      datos: {
        campo: 'ultimaLlamada',
        notas: body.notas,
        generoPedido: body.generoPedido ?? false,
        usuario: authResult.user?.id,
      },
    })

    return apiSuccess({
      clienteId: id,
      ultimaLlamada: new Date().toISOString(),
      mensaje: 'Marcado como contactado. El score sigue acumulando si no hay pedido nuevo.',
    })
  } catch (err) {
    return apiError('Error al marcar contactado', 500)
  }
}
