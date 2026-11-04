// #644 — fechas de pago del sueldo fijo de un trabajador según su frecuencia. Funciones puras sobre fechas
// 'YYYY-MM-DD' (día comercial de Bogotá), sin zona horaria ni base de datos: la fuente única del cálculo de la
// nómina, de «Sueldos que tocan» del cierre y de su pago.

export type FrecuenciaPago = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'FECHAS'

export interface PlanPago {
  frecuenciaPago: FrecuenciaPago | null
  /** SEMANAL: días de la semana (0 = domingo … 6 = sábado). MENSUAL/FECHAS: días del mes (1-31). */
  diasPago: readonly number[]
}

const MS_DIA = 86_400_000
const aUtc = (f: string) => new Date(`${f}T12:00:00Z`)
const aTexto = (d: Date) => d.toISOString().slice(0, 10)

/** Último día del mes de la fecha dada. */
function ultimoDiaDelMes(anio: number, mes0: number): number {
  return new Date(Date.UTC(anio, mes0 + 1, 0, 12)).getUTCDate()
}

/** Valida el plan de pago de un formulario. Devuelve el mensaje de error o null si es válido. */
export function validarPlanPago(plan: PlanPago): string | null {
  const { frecuenciaPago, diasPago } = plan
  if (frecuenciaPago === null) return diasPago.length === 0 ? null : 'Elige una frecuencia de pago o quita los días'
  if (frecuenciaPago === 'QUINCENAL') return null
  if (diasPago.length === 0) return 'Elige al menos un día de pago'
  if (!diasPago.every(Number.isInteger)) return 'Los días de pago deben ser números enteros'
  if (frecuenciaPago === 'SEMANAL') {
    if (!diasPago.every((d) => d >= 0 && d <= 6)) return 'Los días de la semana van de 0 (domingo) a 6 (sábado)'
    return null
  }
  if (!diasPago.every((d) => d >= 1 && d <= 31)) return 'Los días del mes van de 1 a 31'
  if (frecuenciaPago === 'MENSUAL' && diasPago.length !== 1) return 'El pago mensual tiene un solo día'
  return null
}

/**
 * Fechas de pago (YYYY-MM-DD, ordenadas, sin repetir) que caen entre `desde` y `hasta`, ambas incluidas.
 * Sin frecuencia devuelve []. Un día 29-31 en un mes más corto se paga el último día de ese mes.
 */
export function fechasDePago(plan: PlanPago, desde: string, hasta: string): string[] {
  const { frecuenciaPago, diasPago } = plan
  if (frecuenciaPago === null || desde > hasta) return []
  const inicio = aUtc(desde)
  const fin = aUtc(hasta)
  const fechas = new Set<string>()

  if (frecuenciaPago === 'SEMANAL') {
    const dias = new Set<number>(diasPago)
    for (let t = inicio.getTime(); t <= fin.getTime(); t += MS_DIA) {
      const d = new Date(t)
      if (dias.has(d.getUTCDay())) fechas.add(aTexto(d))
    }
    return [...fechas].sort()
  }

  // Quincenal / mensual / fechas: se recorre mes a mes (de un mes antes por seguridad no hace falta: se filtra por rango).
  const diasDelMes = frecuenciaPago === 'QUINCENAL' ? [15, 31] : diasPago
  let anio = inicio.getUTCFullYear()
  let mes0 = inicio.getUTCMonth()
  const anioFin = fin.getUTCFullYear()
  const mesFin = fin.getUTCMonth()
  while (anio < anioFin || (anio === anioFin && mes0 <= mesFin)) {
    const ultimo = ultimoDiaDelMes(anio, mes0)
    for (const dia of diasDelMes) {
      const real = Math.min(dia, ultimo)
      const f = `${anio}-${String(mes0 + 1).padStart(2, '0')}-${String(real).padStart(2, '0')}`
      if (f >= desde && f <= hasta) fechas.add(f)
    }
    mes0 += 1
    if (mes0 > 11) { mes0 = 0; anio += 1 }
  }
  return [...fechas].sort()
}

/** Cuántos días hacia atrás se miran las fechas de pago sin pagar (más allá se considera historia). */
export const DIAS_REVISION_SUELDOS = 31

export interface SueldoQueToca {
  fecha: string
  monto: number
}

/**
 * Fechas de pago ya cumplidas (hasta `hoy`) dentro de la ventana de revisión que ninguna nómina cubre.
 * `cubierta(fecha)` dice si una nómina vigente de ese trabajador ya cubre ese día.
 */
export function sueldosQueTocan(
  plan: PlanPago,
  salarioFijo: number,
  hoy: string,
  cubierta: (fecha: string) => boolean,
  diasRevision: number = DIAS_REVISION_SUELDOS,
  /** Primer día en que rige el plan: las fechas anteriores no cuentan como pendientes. */
  desdeMinimo?: string,
): SueldoQueToca[] {
  if (plan.frecuenciaPago === null || !(salarioFijo > 0)) return []
  const ventana = aTexto(new Date(aUtc(hoy).getTime() - diasRevision * MS_DIA))
  const desde = desdeMinimo && desdeMinimo > ventana ? desdeMinimo : ventana
  return fechasDePago(plan, desde, hoy)
    .filter((f) => !cubierta(f))
    .map((fecha) => ({ fecha, monto: salarioFijo }))
}
