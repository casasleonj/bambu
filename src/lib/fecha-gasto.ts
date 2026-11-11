import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

/**
 * #753: una fecha calendario sin hora es la medianoche de Bogotá, no UTC.
 * Si se recibe un instante, debe traer zona explícita (Z o ±HH:mm):
 * las fechas locales con hora pero sin offset son ambiguas.
 * Devolvemos null para no persistir silenciosamente un día inválido.
 */
export function parseFechaGasto(valor: string): Date | null {
  const soloDia = /^\d{4}-\d{2}-\d{2}$/
  const instanteConZona = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/
  const dia = soloDia.test(valor) ? valor : instanteConZona.exec(valor)?.[1]
  if (!dia) return null
  const comienzo = startOfDayInBogota(dia)
  if (!Number.isFinite(comienzo.getTime()) || dayInBogota(comienzo) !== dia) return null
  if (soloDia.test(valor)) return comienzo
  // UTC±14:00 es el máximo offset válido.
  if (/[+-]14:(?!00$)\d{2}$/.test(valor)) return null
  const instante = new Date(valor)
  return Number.isFinite(instante.getTime()) ? instante : null
}

export const fechaGastoValida = (valor: string): boolean => parseFechaGasto(valor) !== null
