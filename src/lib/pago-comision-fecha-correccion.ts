// #834 — Corrección administrativa (solo ADMIN) del día REAL de caja de un pago de comisión (`fechaPagoReal`, #770).
// Es la «conciliación» que #770 anuncia cuando rechaza un pago nuevo en un día cerrado. Motivo obligatorio y rastro que solo añade
// filas. No toca `createdAt` ni `fecha` (la nómina no cambia). Un día ya cerrado NO se bloquea ni se reescribe: conserva su cifra
// guardada y V16 compara con el día que el pago tenía cuando se hizo el cierre.

import { acquireAdvisoryLockTx } from '@/lib/locks'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { logAudit } from '@/lib/audit'
import { dayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'
import { esDiaValido } from '@/lib/fecha-pago-efectiva'

export type CodigoCorreccionComision =
  | 'FORBIDDEN'
  | 'PAGO_NOT_FOUND'
  | 'MOTIVO_REQUERIDO'
  | 'FECHA_PAGO_INVALIDA'
  | 'FECHA_PAGO_FUTURA'
  | 'FECHA_PAGO_ANTERIOR_AL_TRABAJO'
  | 'SIN_CAMBIO'
  | 'OFFLINE_ID_EN_USO'

const STATUS: Record<CodigoCorreccionComision, number> = {
  FORBIDDEN: 403,
  PAGO_NOT_FOUND: 404,
  OFFLINE_ID_EN_USO: 409,
  MOTIVO_REQUERIDO: 422,
  FECHA_PAGO_INVALIDA: 422,
  FECHA_PAGO_FUTURA: 422,
  FECHA_PAGO_ANTERIOR_AL_TRABAJO: 422,
  SIN_CAMBIO: 422,
}

export class CorreccionFechaComisionError extends Error {
  readonly status: number
  constructor(readonly code: CodigoCorreccionComision, message: string) {
    super(message)
    this.name = 'CorreccionFechaComisionError'
    this.status = STATUS[code]
  }
}

export interface CorregirFechaComisionInput {
  pagoId: string
  /** Día en que realmente salió el dinero (YYYY-MM-DD, Bogotá). */
  fechaPagoReal: string
  motivo: string
  actorId: string
  actorRol: string
  offlineId?: string
}

export interface CorreccionComisionResultado {
  id: string
  pagoId: string
  /** Día real antes de corregir; `null` = estaba «sin verificar». */
  fechaAnterior: string | null
  fechaNueva: string
  /** Días implicados (el anterior y el nuevo) que ya tienen cierre guardado: ese cierre no cambia. */
  diasCerrados: string[]
  deduped: boolean
}

/** Solo el ADMIN corrige un día de caja. */
export const puedeCorregirFechaComision = (rol: string | null | undefined): boolean => rol === 'ADMIN'

export async function corregirFechaRealPagoComision(input: CorregirFechaComisionInput): Promise<CorreccionComisionResultado> {
  if (!puedeCorregirFechaComision(input.actorRol)) {
    throw new CorreccionFechaComisionError('FORBIDDEN', 'Solo un administrador puede corregir el día de caja de un pago.')
  }
  const motivo = input.motivo.trim()
  if (motivo.length < 3) throw new CorreccionFechaComisionError('MOTIVO_REQUERIDO', 'Cuéntanos por qué se corrige.')
  if (!esDiaValido(input.fechaPagoReal)) throw new CorreccionFechaComisionError('FECHA_PAGO_INVALIDA', 'La fecha debe ser AAAA-MM-DD.')
  if (input.fechaPagoReal > todayInBogota()) {
    throw new CorreccionFechaComisionError('FECHA_PAGO_FUTURA', 'No puedes elegir un día que no ha llegado. Elige hoy o uno anterior.')
  }

  return executeSerializableWithRetry(async (tx): Promise<CorreccionComisionResultado> => {
    if (input.offlineId) {
      const repetida = await tx.pagoComisionFechaCorreccion.findUnique({ where: { offlineId: input.offlineId } })
      if (repetida) {
        if (repetida.pagoId !== input.pagoId || dayInBogota(repetida.fechaRealNueva) !== input.fechaPagoReal) {
          throw new CorreccionFechaComisionError('OFFLINE_ID_EN_USO', 'Esa clave de reintento ya se usó para otra corrección.')
        }
        return {
          id: repetida.id,
          pagoId: repetida.pagoId,
          fechaAnterior: repetida.fechaRealAnterior ? dayInBogota(repetida.fechaRealAnterior) : null,
          fechaNueva: dayInBogota(repetida.fechaRealNueva),
          diasCerrados: [],
          deduped: true,
        }
      }
    }

    const pago = await tx.pagoComisionRepartidor.findUnique({
      where: { id: input.pagoId },
      select: { id: true, trabajadorId: true, fecha: true, fechaPagoReal: true, createdAt: true, monto: true, metodo: true },
    })
    if (!pago) throw new CorreccionFechaComisionError('PAGO_NOT_FOUND', 'No se encontró ese pago.')
    if (input.fechaPagoReal < dayInBogota(pago.fecha)) {
      throw new CorreccionFechaComisionError(
        'FECHA_PAGO_ANTERIOR_AL_TRABAJO',
        `No puede ser anterior al día trabajado (${dayInBogota(pago.fecha)}). Elige ese día o uno posterior.`,
      )
    }
    const diaAnterior = pago.fechaPagoReal ? dayInBogota(pago.fechaPagoReal) : null
    if (diaAnterior === input.fechaPagoReal) {
      throw new CorreccionFechaComisionError('SIN_CAMBIO', 'Ese ya es el día de caja de este pago.')
    }

    // Misma exclusión que el cierre y que el pago (clave `CIERRE` por día), siempre en el mismo orden para no cruzar bloqueos.
    const diasImplicados = [...new Set([diaAnterior ?? dayInBogota(pago.createdAt), input.fechaPagoReal])].sort()
    for (const d of diasImplicados) await acquireAdvisoryLockTx(tx, 'CIERRE', startOfDayInBogota(d).toISOString())

    const cierres = await tx.cierreDia.findMany({
      where: { fecha: { in: diasImplicados.map((d) => startOfDayInBogota(d)) } },
      select: { fecha: true },
    })
    const diasCerrados = cierres.map((c) => dayInBogota(c.fecha)).sort()

    const nueva = startOfDayInBogota(input.fechaPagoReal)
    await tx.pagoComisionRepartidor.update({ where: { id: pago.id }, data: { fechaPagoReal: nueva } })
    const fila = await tx.pagoComisionFechaCorreccion.create({
      data: {
        pagoId: pago.id,
        fechaRealAnterior: pago.fechaPagoReal,
        fechaRealNueva: nueva,
        motivo,
        corregidoPorId: input.actorId,
        offlineId: input.offlineId ?? null,
      },
    })
    await logAudit(
      {
        entidad: 'PagoComisionRepartidor',
        registroId: pago.id,
        accion: 'UPDATE',
        datos: {
          correccionDiaCaja: {
            correccionId: fila.id,
            trabajadorId: pago.trabajadorId,
            monto: Number(pago.monto),
            metodo: pago.metodo,
            diaAnterior,
            diaNuevo: input.fechaPagoReal,
            diasCerrados,
            registradoEl: dayInBogota(pago.createdAt),
            motivo,
          },
        },
        usuarioId: input.actorId,
      },
      tx,
    )
    return { id: fila.id, pagoId: pago.id, fechaAnterior: diaAnterior, fechaNueva: input.fechaPagoReal, diasCerrados, deduped: false }
  }, 'nomina/pagos-comision/corregir-fecha')
}
