import { z } from 'zod'
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { SolicitarReduccionComercialUseCase } from '@/modules/pedidos/application/use-cases/ReduccionComercialUseCases'
import { MEDIOS_CONSENTIMIENTO } from '@/modules/pedidos/domain/services/reduccion-comercial.service'
import { mapReduccionComercialError } from '@/modules/pedidos/presentation/reduccion-comercial-http'

const ReducirPedidoSchema = z.object({
  producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']),
  cantidadReducida: z.number().int().positive().max(100_000),
  motivo: z.string().max(500),
  aceptadoPor: z.string().max(120),
  medio: z.enum(MEDIOS_CONSENTIMIENTO),
  offlineId: z.string().optional(),
})

/**
 * POST /api/pedidos/[id]/reducir-pedido — registra que el cliente ya no quiere parte de lo
 * pedido (#451). Quien tiene el permiso de autorizar la aplica en el acto; los demás dejan
 * una solicitud PENDIENTE que se resuelve en PATCH /api/pedidos/reducciones-comerciales/[id].
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const parsed = ReducirPedidoSchema.safeParse(await request.json())
    if (!parsed.success) return apiError(formatZodError(parsed.error), 400)

    const result = await new SolicitarReduccionComercialUseCase().execute({
      pedidoId: id,
      producto: parsed.data.producto,
      cantidadReducida: parsed.data.cantidadReducida,
      motivo: parsed.data.motivo,
      aceptadoPor: parsed.data.aceptadoPor,
      medio: parsed.data.medio,
      actorId: auth.user?.id ?? '',
      offlineId: parsed.data.offlineId,
    })
    return apiSuccess(result, result.deduped ? 200 : 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    const conocido = mapReduccionComercialError(message)
    if (conocido) return apiError(conocido.message, conocido.status, conocido.code ? { code: conocido.code } : undefined)
    logger.error({ err: message }, 'Error registrando reducción comercial')
    return apiError('Error al registrar la reducción del pedido', 500)
  }
}
