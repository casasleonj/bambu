// #645 — fechas en las que se puede registrar o corregir una Producción. Regla pura (día comercial de Bogotá):
// el cierre puede atrasarse, así que la producción del día que se está cerrando se registra en SU fecha, no en la de hoy.

/** Cuántos días atrás se puede registrar o corregir la producción de un día aún sin cerrar. */
export const DIAS_MAX_PRODUCCION_ATRASADA = 7

const MS_DIA = 86_400_000
const aUtc = (f: string) => new Date(`${f}T12:00:00Z`).getTime()

/**
 * Devuelve el motivo por el que `fecha` no sirve para registrar producción, o null si sirve.
 * `hoy` es el día comercial actual (YYYY-MM-DD).
 */
export function motivoFechaProduccionInvalida(fecha: string, hoy: string): 'FECHA_FUTURA' | 'FECHA_MUY_ANTIGUA' | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(aUtc(fecha))) return 'FECHA_MUY_ANTIGUA'
  if (fecha > hoy) return 'FECHA_FUTURA'
  const dias = Math.round((aUtc(hoy) - aUtc(fecha)) / MS_DIA)
  return dias > DIAS_MAX_PRODUCCION_ATRASADA ? 'FECHA_MUY_ANTIGUA' : null
}
