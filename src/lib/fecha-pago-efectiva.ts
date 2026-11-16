// #673 punto 2 — fecha EFECTIVA de un pago al personal (cuándo salió el dinero), distinta de cuándo se anotó.
// Reglas únicas para comisiones y sueldos: sin fecha o «hoy» es el pago normal; una fecha pasada necesita motivo y deja
// rastro; una fecha futura se rechaza. Un día ya cerrado NO bloquea (el dinero salió ese día): el cierre guardado no se
// reescribe y V16 lo ve como explicado.

import { dayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'

export type CodigoFechaPago = 'FECHA_PAGO_FUTURA' | 'MOTIVO_FECHA_REQUERIDO' | 'FECHA_PAGO_INVALIDA'

export class FechaPagoError extends Error {
  readonly status = 422
  constructor(readonly code: CodigoFechaPago, mensaje: string) {
    super(mensaje)
    this.name = 'FechaPagoError'
  }
}

export interface FechaPagoResuelta {
  /** `true` = pago normal (sin fecha, o la de hoy): se usa el momento de la captura. */
  esHoy: boolean
  /** Día (YYYY-MM-DD, Bogotá) en que salió el dinero. */
  dia: string
  /** Instante a guardar cuando NO es hoy (mediodía de Bogotá de ese día); `null` si es hoy. */
  instante: Date | null
  /** Motivo ya recortado; `null` si es hoy. */
  motivo: string | null
}

const FORMATO = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` real, con ida y vuelta: rechaza 2026-02-30, que JavaScript desplazaría a marzo. */
export function esDiaValido(dia: string): boolean {
  if (!FORMATO.test(dia)) return false
  const d = new Date(`${dia}T12:00:00-05:00`)
  return !Number.isNaN(d.getTime()) && dayInBogota(d) === dia
}

/** Mediodía de Bogotá de `dia`: queda dentro de ese día sin rozar sus bordes. */
export function instanteDelDia(dia: string): Date {
  return new Date(startOfDayInBogota(dia).getTime() + 12 * 3_600_000)
}

export function resolverFechaPago(entrada: { fecha?: string | null; motivo?: string | null; hoy?: string }): FechaPagoResuelta {
  const hoy = entrada.hoy ?? todayInBogota()
  const fecha = entrada.fecha?.trim()
  if (!fecha || fecha === hoy) return { esHoy: true, dia: hoy, instante: null, motivo: null }
  if (!esDiaValido(fecha)) {
    throw new FechaPagoError('FECHA_PAGO_INVALIDA', 'La fecha del pago debe ser AAAA-MM-DD.')
  }
  if (fecha > hoy) throw new FechaPagoError('FECHA_PAGO_FUTURA', 'No se puede registrar un pago con una fecha que no ha llegado.')
  const motivo = (entrada.motivo ?? '').trim()
  if (motivo.length < 3) {
    throw new FechaPagoError('MOTIVO_FECHA_REQUERIDO', 'Si el pago se entregó otro día, indica por qué se anota con esa fecha.')
  }
  return { esHoy: false, dia: fecha, instante: instanteDelDia(fecha), motivo }
}

/**
 * Fecha del pago de una nómina/sueldo y la nota que deja el egreso. Pago normal (sin fecha o hoy): el momento de la captura,
 * sin nota. Otra fecha: ese día (`createdAt` guarda la captura) y una nota con el motivo. Lanza `FechaPagoError`.
 */
export function fechaDePagoNomina(entrada: { fechaPago?: string; motivoFecha?: string }): { fechaDelPago: Date; nota: string | null } {
  const r = resolverFechaPago({ fecha: entrada.fechaPago, motivo: entrada.motivoFecha })
  return {
    fechaDelPago: r.instante ?? new Date(),
    nota: r.esHoy ? null : `Pagado el ${r.dia}, anotado después. Motivo: ${r.motivo}`,
  }
}
