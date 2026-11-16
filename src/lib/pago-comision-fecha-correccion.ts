// #673 — Corrección administrativa auditada de la fecha EFECTIVA de caja de un pago de comisión (servidor).
// Solo ADMIN; motivo obligatorio; sin tocar `createdAt` (captura) ni `fecha` (día del trabajo). A diferencia de #617 (cobros de
// clientes, que no mueven caja), aquí la fecha efectiva SÍ decide en qué cierre resta el dinero; por eso un día ya cerrado no
// se bloquea ni se reescribe: conserva su cifra guardada y V16 ve el pago como explicado por esta corrección.

import { acquireAdvisoryLockTx, withAdvisoryLock } from '@/lib/locks'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { dayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'
import { esDiaValido, instanteDelDia } from '@/lib/fecha-pago-efectiva'

export type CodigoCorreccionComision =
  | 'FORBIDDEN'
  | 'PAGO_NOT_FOUND'
  | 'MOTIVO_REQUERIDO'
  | 'FECHA_PAGO_INVALIDA'
  | 'FECHA_PAGO_FUTURA'
  | 'SIN_CAMBIO'

const STATUS: Record<CodigoCorreccionComision, number> = {
  FORBIDDEN: 403,
  PAGO_NOT_FOUND: 404,
  MOTIVO_REQUERIDO: 422,
  FECHA_PAGO_INVALIDA: 422,
  FECHA_PAGO_FUTURA: 422,
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
  fecha: string
  motivo: string
  actorId: string
  actorRol: string
  offlineId?: string
}

export interface CorreccionComisionResultado {
  id: string
  pagoId: string
  fechaAnterior: string
  fechaNueva: string
  deduped: boolean
}

/** Solo el ADMIN corrige una fecha de caja (misma decisión que #617). */
export const puedeCorregirFechaComision = (rol: string | null | undefined): boolean => rol === 'ADMIN'

export async function corregirFechaPagoComision(input: CorregirFechaComisionInput): Promise<CorreccionComisionResultado> {
  if (!puedeCorregirFechaComision(input.actorRol)) {
    throw new CorreccionFechaComisionError('FORBIDDEN', 'Solo un administrador puede corregir la fecha de un pago de comisión.')
  }
  const motivo = input.motivo.trim()
  if (motivo.length < 3) throw new CorreccionFechaComisionError('MOTIVO_REQUERIDO', 'Indica por qué se corrige la fecha.')
  if (!esDiaValido(input.fecha)) throw new CorreccionFechaComisionError('FECHA_PAGO_INVALIDA', 'La fecha debe ser AAAA-MM-DD.')
  if (input.fecha > todayInBogota()) {
    throw new CorreccionFechaComisionError('FECHA_PAGO_FUTURA', 'No se puede fijar una fecha que no ha llegado.')
  }

  const previo = await prisma.pagoComisionRepartidor.findUnique({ where: { id: input.pagoId }, select: { createdAt: true, pagadoAt: true } })
  if (!previo) throw new CorreccionFechaComisionError('PAGO_NOT_FOUND', 'No se encontró ese pago.')

  // Serializa con el cierre de los dos días implicados (misma clave que el cierre), siempre en el mismo orden.
  const dias = [...new Set([dayInBogota(previo.pagadoAt ?? previo.createdAt), input.fecha])].sort()
  const [primero, ...resto] = dias

  return withAdvisoryLock('CIERRE', startOfDayInBogota(primero).toISOString(), async (tx): Promise<CorreccionComisionResultado> => {
    for (const d of resto) await acquireAdvisoryLockTx(tx, 'CIERRE', startOfDayInBogota(d).toISOString())

    if (input.offlineId) {
      const repetida = await tx.pagoComisionFechaCorreccion.findUnique({ where: { offlineId: input.offlineId } })
      if (repetida) {
        return {
          id: repetida.id,
          pagoId: repetida.pagoId,
          fechaAnterior: repetida.fechaAnterior.toISOString(),
          fechaNueva: repetida.fechaNueva.toISOString(),
          deduped: true,
        }
      }
    }
    const pago = await tx.pagoComisionRepartidor.findUnique({
      where: { id: input.pagoId },
      select: { id: true, trabajadorId: true, createdAt: true, pagadoAt: true, monto: true, metodo: true },
    })
    if (!pago) throw new CorreccionFechaComisionError('PAGO_NOT_FOUND', 'No se encontró ese pago.')

    const fechaAnterior = pago.pagadoAt ?? pago.createdAt
    if (dayInBogota(fechaAnterior) === input.fecha) {
      throw new CorreccionFechaComisionError('SIN_CAMBIO', 'El pago ya tiene esa fecha de caja.')
    }
    const fechaNueva = instanteDelDia(input.fecha)

    await tx.pagoComisionRepartidor.update({ where: { id: pago.id }, data: { pagadoAt: fechaNueva } })
    const fila = await tx.pagoComisionFechaCorreccion.create({
      data: {
        pagoId: pago.id,
        fechaAnterior,
        fechaNueva,
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
          correccionFechaCaja: {
            correccionId: fila.id,
            trabajadorId: pago.trabajadorId,
            monto: Number(pago.monto),
            metodo: pago.metodo,
            fechaAnterior: fechaAnterior.toISOString(),
            fechaNueva: fechaNueva.toISOString(),
            diaAnterior: dayInBogota(fechaAnterior),
            diaNuevo: input.fecha,
            registradoEl: dayInBogota(pago.createdAt),
            motivo,
          },
        },
        usuarioId: input.actorId,
      },
      tx,
    )
    return {
      id: fila.id,
      pagoId: pago.id,
      fechaAnterior: fechaAnterior.toISOString(),
      fechaNueva: fechaNueva.toISOString(),
      deduped: false,
    }
  })
}
