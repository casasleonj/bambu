import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { GestionarPendienteUseCase } from '@/modules/embarques/application/use-cases/GestionarPendienteUseCase'

const GestionarPendienteSchema = z.object({
  producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']),
  cantidad: z.number().int().positive(),
  modoInicial: z.enum(['PUNTO', 'DOMICILIO']),
  motivo: z.string().optional(),
  offlineId: z.string().optional(),
})

/**
 * POST /api/pedidos/[id]/gestionar-pendiente — Fase 2 del rediseño de
 * Pedidos (docs/pedidos/00-plan-frontend-rediseno-integral.md D4): primer
 * endpoint HTTP para `GestionarPendienteUseCase` (N2, AGUA_BAMBU_N2_ALS_v2.0.md
 * §3.1), que existía como caso de uso probado (gestionar-pendiente-integridad
 * .test.ts) pero sin ruta expuesta desde el día 1 del diseño N2 (el sistema
 * prepara, el usuario decide — nunca automático). Thin controller: valida,
 * delega, mapea errores — sin lógica de negocio acá.
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
  const usuarioId = role.user?.id
  if (!usuarioId) return apiError('No autorizado', 401)

  try {
    const body = await request.json()
    const parsed = GestionarPendienteSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const useCase = new GestionarPendienteUseCase()
    const result = await useCase.execute({
      pedidoId: id,
      producto: parsed.data.producto,
      cantidad: parsed.data.cantidad,
      modoInicial: parsed.data.modoInicial,
      motivo: parsed.data.motivo,
      usuarioId,
      offlineId: parsed.data.offlineId,
    })

    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PEDIDO_NOT_FOUND') return apiError('Pedido no encontrado', 404)
      if (error.message.startsWith('PEDIDO_ITEM_NOT_FOUND')) return apiError(error.message, 404)
      if (error.message.startsWith('CANTIDAD_EXCEDE_PENDIENTE')) return apiError(error.message, 409)
      if (error.message.startsWith('OBLIGACION_YA_ACTIVA')) return apiError(error.message, 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error gestionando pendiente')
    return apiError('Error gestionando pendiente', 500)
  }
}
