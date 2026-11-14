import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { withAdvisoryLock } from '@/lib/locks'
import { devolverSaldoFavor, METODOS_DEVOLUCION } from '@/lib/devolver-saldo-favor'
import { publishRealtimeEvent } from '@/lib/realtime'
import { formatZodError } from '@/lib/utils'

const DevolverSchema = z.object({
  monto: z.number().positive().max(100_000_000),
  metodo: z.enum(METODOS_DEVOLUCION),
  motivo: z.string().trim().min(3).max(300),
  offlineId: z.string().trim().min(8).max(100),
})

const ESTADO_HTTP = {
  CLIENTE_NO_ENCONTRADO: 404,
  CLIENTE_ANONIMO: 422,
  MONTO_INVALIDO: 400,
  SALDO_INSUFICIENTE: 409,
  OFFLINE_ID_DE_OTRO_CLIENTE: 409,
} as const

/**
 * POST /api/clientes/[id]/saldo-favor/devolver (#560) — devolver al cliente su saldo a favor. Solo ADMIN
 * (es una salida de dinero). Idempotente por `offlineId`. Solo el EFECTIVO resta de la caja del cierre del día.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN], auth)
  if (role instanceof Response) return role
  const { id } = await params
  if (!auth.user?.id) return apiError('Sesión inválida', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('Cuerpo inválido', 400)
  }
  const parsed = DevolverSchema.safeParse(body)
  if (!parsed.success) return apiError(formatZodError(parsed.error), 400)

  try {
    const resultado = await withAdvisoryLock('CARTERA', id, (tx) =>
      devolverSaldoFavor(tx, { clienteId: id, ...parsed.data, autorizadoPorId: auth.user?.id ?? '' }),
    )
    if (!resultado.ok) {
      return apiError(resultado.mensaje, ESTADO_HTTP[resultado.codigo], {
        code: resultado.codigo,
        ...(resultado.saldo !== undefined ? { impacto: { saldo: resultado.saldo } } : {}),
      })
    }
    if (!resultado.deduped) {
      publishRealtimeEvent('cliente.updated', id).catch(() => {})
    }
    return apiSuccess(resultado, resultado.deduped ? 200 : 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown', clienteId: id }, 'Error devolviendo el saldo a favor')
    return apiError('Error devolviendo el saldo a favor')
  }
}
