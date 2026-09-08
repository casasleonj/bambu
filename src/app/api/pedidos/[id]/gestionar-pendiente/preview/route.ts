import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import {
  ProyectarGestionPendienteUseCase,
  ProyectarGestionPendienteError,
} from '@/modules/embarques/application/use-cases/ProyectarGestionPendienteUseCase'

const ProyectarSchema = z
  .object({
    accion: z.enum(['gestionar', 'cambiar-modo', 'liberar']),
    producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']).optional(),
    cantidad: z.number().int().positive().optional(),
    modoDestino: z.enum(['PUNTO', 'DOMICILIO']).optional(),
    actividadId: z.string().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.accion === 'gestionar' && (!v.producto || v.cantidad == null || !v.modoDestino)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'gestionar requiere producto, cantidad y modoDestino' })
    }
    if ((v.accion === 'cambiar-modo' || v.accion === 'liberar') && !v.actividadId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${v.accion} requiere actividadId` })
    }
    if (v.accion === 'cambiar-modo' && !v.modoDestino) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cambiar-modo requiere modoDestino' })
    }
  })

/**
 * POST /api/pedidos/[id]/gestionar-pendiente/preview — Fase 5-0 del rediseño
 * de Pedidos (docs/pedidos/fase5-n2-flujo-plan.md P2). **Proyección read-only**
 * del impacto económico de una acción N2 (gestionar / cambiar modo / liberar)
 * ANTES de ejecutarla. NUNCA muta. El commit real revalida y recalcula todo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = ProyectarSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new ProyectarGestionPendienteUseCase()
    const result = await useCase.execute({
      pedidoId: id,
      accion: parsed.data.accion,
      producto: parsed.data.producto,
      cantidad: parsed.data.cantidad,
      modoDestino: parsed.data.modoDestino,
      actividadId: parsed.data.actividadId,
    })
    return apiSuccess(result)
  } catch (error) {
    if (error instanceof ProyectarGestionPendienteError) {
      const msg = error.message
      if (msg === 'PEDIDO_NOT_FOUND') return apiError('Pedido no encontrado', 404)
      if (msg.startsWith('PEDIDO_ITEM_NOT_FOUND')) return apiError(msg, 404)
      if (msg === 'ACTIVIDAD_NOT_FOUND') return apiError('Actividad no encontrada', 404)
      return apiError(msg, 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error proyectando gestión de pendiente')
    return apiError('Error proyectando la gestión del pendiente', 500)
  }
}
