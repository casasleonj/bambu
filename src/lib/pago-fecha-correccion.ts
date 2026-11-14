// #617 — Reglas PURAS de la corrección de la fecha efectiva de un pago (sin base de datos).
//
// Tres fechas (#402): `createdAt` = REGISTRO (la pone la base y concilia la caja: NUNCA cambia);
// `ocurridoAt` = cuándo se cobró de verdad (NULL = el mismo instante del registro).
// Corregir la fecha efectiva cambia lo que muestran el pedido, el cliente y la factura; no mueve dinero entre cierres.

import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

export type CodigoCorreccionFecha =
  | 'FORBIDDEN'
  | 'PAGO_NOT_FOUND'
  | 'MOTIVO_REQUERIDO'
  | 'FECHA_INVALIDA'
  | 'FECHA_POSTERIOR_AL_REGISTRO'
  | 'SIN_CAMBIO'
  | 'PAGO_REGULARIZADO'
  | 'DIA_CERRADO'

const STATUS: Record<CodigoCorreccionFecha, number> = {
  FORBIDDEN: 403,
  PAGO_NOT_FOUND: 404,
  MOTIVO_REQUERIDO: 400,
  FECHA_INVALIDA: 400,
  FECHA_POSTERIOR_AL_REGISTRO: 422,
  SIN_CAMBIO: 400,
  PAGO_REGULARIZADO: 409,
  DIA_CERRADO: 409,
}

export class CorreccionFechaPagoError extends Error {
  readonly status: number
  constructor(readonly code: CodigoCorreccionFecha, message: string) {
    super(message)
    this.name = 'CorreccionFechaPagoError'
    this.status = STATUS[code]
  }
}

/** Solo el ADMIN corrige una fecha de pago (decisión del PO 2026-11-08). */
export function puedeCorregirFechaPago(rol: string | null | undefined): boolean {
  return rol === 'ADMIN'
}

/** Valida `YYYY-MM-DD` con ida y vuelta (rechaza 2026-02-30). */
export function esDiaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false
  const d = new Date(`${dia}T12:00:00-05:00`)
  return !Number.isNaN(d.getTime()) && dayInBogota(d) === dia
}

export interface ResolucionFecha {
  /** Valor para guardar en `Pago.ocurridoAt` (`null` = igual al registro). */
  ocurridoAt: Date | null
  /** Fecha efectiva antes de corregir (`ocurridoAt ?? createdAt`). */
  fechaAnterior: Date
  /** Fecha efectiva después de corregir (`ocurridoAt ?? createdAt`). */
  fechaNueva: Date
  diaAnterior: string
  diaNuevo: string
}

/**
 * Decide qué se guarda al corregir. Reglas:
 * - el día nuevo es válido y NO posterior al día del registro (un cobro no puede ser posterior a cuando se anotó);
 * - si el día nuevo es el mismo del registro, la fecha efectiva vuelve a ser el registro (`ocurridoAt = null`);
 * - si es un día anterior, se guarda el mediodía de Bogotá de ese día (siempre ≤ `createdAt`);
 * - si el día no cambia respecto de la fecha efectiva actual, no hay nada que corregir.
 */
export function resolverCorreccionFecha(
  pago: { createdAt: Date; ocurridoAt: Date | null },
  diaNuevo: string,
): ResolucionFecha {
  if (!esDiaValido(diaNuevo)) {
    throw new CorreccionFechaPagoError('FECHA_INVALIDA', 'La fecha no es válida. Usa el formato AAAA-MM-DD.')
  }
  const diaRegistro = dayInBogota(pago.createdAt)
  if (diaNuevo > diaRegistro) {
    throw new CorreccionFechaPagoError(
      'FECHA_POSTERIOR_AL_REGISTRO',
      'La fecha de cobro no puede ser posterior al día en que se registró el pago.',
    )
  }
  const fechaAnterior = pago.ocurridoAt ?? pago.createdAt
  const diaAnterior = dayInBogota(fechaAnterior)
  if (diaNuevo === diaAnterior) {
    throw new CorreccionFechaPagoError('SIN_CAMBIO', 'Esa ya es la fecha del cobro. Elige otra.')
  }
  const ocurridoAt = diaNuevo === diaRegistro ? null : new Date(startOfDayInBogota(diaNuevo).getTime() + 12 * 3_600_000)
  return { ocurridoAt, fechaAnterior, fechaNueva: ocurridoAt ?? pago.createdAt, diaAnterior, diaNuevo }
}

/**
 * Aviso (no bloqueo) para la pantalla: un cobro con fecha anterior a la creación del pedido puede ser un anticipo real.
 * Compara por día de Bogotá.
 */
export function cobroAnteriorAlPedido(fechaEfectiva: Date, pedidoCreadoAt: Date): boolean {
  return dayInBogota(fechaEfectiva) < dayInBogota(pedidoCreadoAt)
}
