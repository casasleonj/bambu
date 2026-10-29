import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { formatZodError } from '@/lib/utils'
import { startOfDayBogota, todayStringBogota } from '@/lib/dates'
import { nominaQueCubre } from '@/lib/nomina-cobertura'
import { comisionDiaConEstado } from '@/lib/comision-pagada'

/**
 * POST /api/nomina/dia/pagar — el ADMIN/CONTADOR marca que le pagó al repartidor la comisión
 * pendiente de un día (#499). El monto NUNCA lo manda el cliente: sale de la comisión calculada
 * menos lo ya pagado. `montoEsperado` (opcional) detecta una pantalla desactualizada: si no
 * coincide, responde 409 con las cifras vigentes y no paga nada. `offlineId` hace idempotente
 * el reintento y el doble toque.
 */

const PagarComisionSchema = z.object({
  trabajadorId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  offlineId: z.string().min(8).max(100),
  montoEsperado: z.coerce.number().min(0).optional(),
})

class PagoComisionError extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
    readonly codigo: string,
    readonly datos?: Record<string, number | string>,
  ) {
    super(mensaje)
    this.name = 'PagoComisionError'
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('Cuerpo inválido', 400)
  }
  const parsed = PagarComisionSchema.safeParse(body)
  if (!parsed.success) return apiError(formatZodError(parsed.error), 400)
  const { trabajadorId, fecha, offlineId, montoEsperado } = parsed.data

  const dia = startOfDayBogota(fecha)
  if (Number.isNaN(dia.getTime())) return apiError('Fecha inválida', 400)
  if (fecha > todayStringBogota()) return apiError('No se puede pagar la comisión de un día que no ha llegado', 422, { code: 'FECHA_FUTURA' })

  const userId = (authResult.user as { id?: string } | undefined)?.id

  try {
    const resultado = await executeSerializableWithRetry(async (tx) => {
      const previo = await tx.pagoComisionRepartidor.findUnique({ where: { offlineId } })
      if (previo) {
        if (previo.trabajadorId !== trabajadorId || previo.fecha.getTime() !== dia.getTime()) {
          throw new PagoComisionError(409, 'Esa clave de reintento ya se usó para otro pago', 'OFFLINE_ID_EN_USO')
        }
        return { pago: previo, deduped: true as const }
      }

      const cubre = await nominaQueCubre(tx, trabajadorId, dia)
      if (cubre) {
        throw new PagoComisionError(409, 'Ese día ya está dentro de una nómina de este trabajador: la comisión se paga por la nómina', 'NOMINA_EXISTENTE')
      }

      const filas = await comisionDiaConEstado(tx, fecha)
      const fila = filas.find((f) => f.trabajadorId === trabajadorId)
      if (!fila) throw new PagoComisionError(404, 'Ese trabajador no cobra comisión de repartidor', 'TRABAJADOR_SIN_COMISION')
      if (fila.revisiones.length > 0) throw new PagoComisionError(409, 'Hay entregas por conciliar de este repartidor. Revisa su detalle antes de pagar.', 'COMISION_POR_CONCILIAR')
      if (fila.pendiente <= 0) throw new PagoComisionError(409, 'No hay comisión pendiente de pagar ese día', 'NADA_PENDIENTE', { total: fila.total, pagado: fila.pagado })
      if (montoEsperado !== undefined && Math.abs(montoEsperado - fila.pendiente) > 0.001) {
        throw new PagoComisionError(409, 'La comisión cambió mientras mirabas la pantalla. Revisa el valor nuevo', 'MONTO_CAMBIO', { pendiente: fila.pendiente, total: fila.total, pagado: fila.pagado })
      }

      const pago = await tx.pagoComisionRepartidor.create({
        data: { trabajadorId, fecha: dia, monto: fila.pendiente, pagadoPorId: userId ?? null, offlineId },
      })
      return { pago, deduped: false as const }
    }, 'nomina/dia/pagar')

    if (!resultado.deduped) {
      logAudit({
        entidad: 'PagoComisionRepartidor',
        registroId: resultado.pago.id,
        accion: 'CREATE',
        datos: { trabajadorId, fecha, monto: Number(resultado.pago.monto) },
        usuarioId: userId,
      }).catch(() => {})
    }
    return apiSuccess({
      pago: { id: resultado.pago.id, monto: Number(resultado.pago.monto), fecha, createdAt: resultado.pago.createdAt },
      deduped: resultado.deduped,
    }, resultado.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof PagoComisionError) {
      return apiError(error.message, error.status, { code: error.codigo, ...(error.datos ? { impacto: error.datos } : {}) })
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error pagando comisión del repartidor:')
    return apiError('No se pudo registrar el pago de la comisión', 500)
  }
}
