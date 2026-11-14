import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { formatZodError } from '@/lib/utils'
import { parseDateParam, startOfDayBogota, todayStringBogota } from '@/lib/dates'
import { dayInBogota } from '@/lib/date-helpers'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { nominaQueCubre } from '@/lib/nomina-cobertura'
import { comisionDiaConEstado, comisionSelladoresDia } from '@/lib/comision-pagada'

/**
 * POST /api/nomina/dia/pagar — el ADMIN/CONTADOR marca que le pagó al repartidor la comisión
 * pendiente de un día (#499). El monto NUNCA lo manda el cliente: sale de la comisión calculada
 * menos lo ya pagado. `montoEsperado` (opcional) detecta una pantalla desactualizada: si no
 * coincide, responde 409 con las cifras vigentes y no paga nada. `offlineId` hace idempotente
 * el reintento y el doble toque.
 */

const PagarComisionSchema = z.object({
  trabajadorId: z.string().min(1),
  fecha: z.string().refine(v => parseDateParam(v, '') === v && v !== '', 'Fecha inválida (YYYY-MM-DD)'),
  // Opcional únicamente para reconocer reintentos ya aceptados de clientes anteriores.
  fechaPagoReal: z.string().refine(v => parseDateParam(v, '') === v && v !== '', 'Día del pago inválido (YYYY-MM-DD)').optional(),
  offlineId: z.string().min(8).max(100),
  montoEsperado: z.coerce.number().min(0).optional(),
  // #305: con qué se pagó. Sin indicarlo se asume EFECTIVO (clientes anteriores). Solo EFECTIVO sale de la caja del cierre.
  metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA']).default('EFECTIVO'),
  // #645: REPARTO = comisión del repartidor por entregas; PRODUCCION = comisión del sellador por lo producido. Sin indicarlo se
  // busca primero como repartidor y luego como sellador (clientes anteriores).
  concepto: z.enum(['REPARTO', 'PRODUCCION']).optional(),
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
  const { trabajadorId, fecha, fechaPagoReal, offlineId, montoEsperado, metodo, concepto: conceptoPedido } = parsed.data

  const dia = startOfDayBogota(fecha)
  if (Number.isNaN(dia.getTime())) return apiError('Fecha inválida', 400)
  if (fecha > todayStringBogota()) return apiError('No se puede pagar la comisión de un día que no ha llegado', 422, { code: 'FECHA_FUTURA' })
  if (fechaPagoReal && fechaPagoReal > todayStringBogota()) return apiError('El día en que se entregó el dinero no puede ser futuro', 422, { code: 'FECHA_PAGO_FUTURA' })

  const userId = (authResult.user as { id?: string } | undefined)?.id

  try {
    const resultado = await executeSerializableWithRetry(async (tx) => {
      let concepto: 'REPARTO' | 'PRODUCCION' = 'REPARTO'
      const previo = await tx.pagoComisionRepartidor.findUnique({ where: { offlineId } })
      if (previo) {
        if (previo.trabajadorId !== trabajadorId || previo.fecha.getTime() !== dia.getTime()
          || previo.metodo !== metodo
          || (conceptoPedido !== undefined && previo.concepto !== conceptoPedido)
          || (fechaPagoReal !== undefined && (!previo.fechaPagoReal || dayInBogota(previo.fechaPagoReal) !== fechaPagoReal))
          || (montoEsperado !== undefined && Math.round(Number(previo.monto) * 100) !== Math.round(montoEsperado * 100))) {
          throw new PagoComisionError(409, 'Esa clave de reintento ya se usó para otro pago', 'OFFLINE_ID_EN_USO')
        }
        return { pago: previo, deduped: true as const }
      }

      if (!fechaPagoReal) throw new PagoComisionError(422, 'Indica el día en que se entregó el dinero. Si el formulario es anterior, actualiza la aplicación.', 'FECHA_PAGO_REQUERIDA')
      const diaPago = startOfDayBogota(fechaPagoReal)
      // Misma exclusión que el cierre, y comprobación dentro de Serializable: no cruzar un cierre concurrente.
      await acquireAdvisoryLockTx(tx, 'CIERRE', diaPago.toISOString())
      const cerrado = await tx.cierreDia.findUnique({ where: { fecha: diaPago }, select: { id: true } })
      if (cerrado) throw new PagoComisionError(409, 'Ese día ya está cerrado. El pago requiere conciliación; no se modifica el cierre guardado.', 'DIA_CERRADO')

      const cubre = await nominaQueCubre(tx, trabajadorId, dia)
      if (cubre) {
        throw new PagoComisionError(409, 'Ese día ya está dentro de una nómina de este trabajador: la comisión se paga por la nómina', 'NOMINA_EXISTENTE')
      }

      const filas = conceptoPedido === 'PRODUCCION' ? [] : await comisionDiaConEstado(tx, fecha)
      const repartidor = filas.find((f) => f.trabajadorId === trabajadorId)
      // #645: el sellador cobra su comisión de la Producción del día; se paga con el mismo botón y la misma regla.
      const sellador = repartidor || conceptoPedido === 'REPARTO' ? undefined : (await comisionSelladoresDia(tx, fecha, dia, new Date(dia.getTime() + 86_400_000)))
        .find((f) => f.trabajadorId === trabajadorId)
      concepto = sellador ? 'PRODUCCION' : 'REPARTO'
      const fila = repartidor ?? (sellador ? { total: sellador.total, pagado: sellador.pagado, pendiente: sellador.pendiente, revisiones: [] as unknown[] } : undefined)
      if (!fila) throw new PagoComisionError(404, 'Ese trabajador no cobra comisión ese día', 'TRABAJADOR_SIN_COMISION')
      if (fila.revisiones.length > 0) throw new PagoComisionError(409, 'Hay entregas por conciliar de este repartidor. Revisa su detalle antes de pagar.', 'COMISION_POR_CONCILIAR')
      if (fila.pendiente <= 0) throw new PagoComisionError(409, 'No hay comisión pendiente de pagar ese día', 'NADA_PENDIENTE', { total: fila.total, pagado: fila.pagado })
      if (montoEsperado !== undefined && Math.abs(montoEsperado - fila.pendiente) > 0.001) {
        throw new PagoComisionError(409, 'La comisión cambió mientras mirabas la pantalla. Revisa el valor nuevo', 'MONTO_CAMBIO', { pendiente: fila.pendiente, total: fila.total, pagado: fila.pagado })
      }

      const pago = await tx.pagoComisionRepartidor.create({
        data: { trabajadorId, fecha: dia, fechaPagoReal: diaPago, monto: fila.pendiente, metodo, concepto, pagadoPorId: userId ?? null, offlineId },
      })
      await logAudit({
        entidad: 'PagoComisionRepartidor', registroId: pago.id, accion: 'CREATE',
        datos: { trabajadorId, fecha, fechaPagoReal, monto: Number(pago.monto), metodo: pago.metodo, concepto, registradoAt: pago.createdAt.toISOString() },
        usuarioId: userId,
      }, tx)
      return { pago, deduped: false as const }
    }, 'nomina/dia/pagar')

    return apiSuccess({
      pago: { id: resultado.pago.id, monto: Number(resultado.pago.monto), metodo: resultado.pago.metodo, fecha,
        fechaPagoReal: resultado.pago.fechaPagoReal ? dayInBogota(resultado.pago.fechaPagoReal) : null,
        createdAt: resultado.pago.createdAt },
      deduped: resultado.deduped,
    }, resultado.deduped ? 200 : 201)
  } catch (error) {
    if (error instanceof PagoComisionError) {
      return apiError(error.message, error.status, { code: error.codigo, ...(error.datos ? { impacto: error.datos } : {}) })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('Esa clave de reintento ya se usó para otro pago', 409, { code: 'OFFLINE_ID_EN_USO' })
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error pagando comisión del repartidor:')
    return apiError('No se pudo registrar el pago de la comisión', 500)
  }
}
