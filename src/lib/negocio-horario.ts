/**
 * #836 F2 — Horario de atención semanal de un negocio.
 *
 * Modelo: tramos «HH:MM–HH:MM» por día de la semana (0 = domingo … 6 = sábado), hora de Bogotá.
 * Un día con turno partido tiene varios tramos y la pausa cuenta como CERRADO.
 *  - Sin ningún tramo      → «sin horario configurado»: no se sabe, nunca se afirma que está cerrado.
 *  - Con algún tramo        → un día sin tramos está cerrado.
 * El horario AVISA, nunca bloquea ni oculta un pedido.
 */
import { diaEntregaBogota } from '@/lib/pedidos-entregas-historial'

export interface TramoHorario {
  diaSemana: number
  desde: string
  hasta: string
}

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
/** Orden de presentación: lunes primero. */
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0] as const
export const MAX_TRAMOS_POR_DIA = 4

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function normalizarHorario(tramos: TramoHorario[]): TramoHorario[] {
  return [...tramos].sort((a, b) => a.diaSemana - b.diaSemana || a.desde.localeCompare(b.desde))
}

/** Errores en lenguaje llano; lista vacía = horario válido. */
export function validarHorario(tramos: TramoHorario[]): string[] {
  const errores: string[] = []
  for (const t of tramos) {
    const dia = Number.isInteger(t.diaSemana) && t.diaSemana >= 0 && t.diaSemana <= 6 ? DIAS_SEMANA[t.diaSemana] : null
    if (!dia) { errores.push('Hay un tramo con un día que no existe.'); continue }
    if (!HHMM.test(t.desde) || !HHMM.test(t.hasta)) { errores.push(`${dia}: usa horas válidas (por ejemplo 06:00).`); continue }
    if (t.desde >= t.hasta) errores.push(`${dia}: el tramo ${t.desde}–${t.hasta} termina antes de empezar. Corrígelo para guardar.`)
  }
  for (const d of ORDEN_DIAS) {
    const delDia = normalizarHorario(tramos.filter((t) => t.diaSemana === d && HHMM.test(t.desde) && HHMM.test(t.hasta) && t.desde < t.hasta))
    if (delDia.length > MAX_TRAMOS_POR_DIA) errores.push(`${DIAS_SEMANA[d]}: máximo ${MAX_TRAMOS_POR_DIA} tramos por día.`)
    for (let i = 1; i < delDia.length; i++)
      if (delDia[i].desde < delDia[i - 1].hasta) errores.push(`${DIAS_SEMANA[d]}: los tramos ${delDia[i - 1].desde}–${delDia[i - 1].hasta} y ${delDia[i].desde}–${delDia[i].hasta} se cruzan.`)
  }
  return errores
}

export type EstadoDia = 'sin_horario' | 'cerrado' | 'abierto'

export function estadoDia(horarios: TramoHorario[] | null | undefined, diaSemana: number): EstadoDia {
  if (!horarios || horarios.length === 0) return 'sin_horario'
  return horarios.some((t) => t.diaSemana === diaSemana) ? 'abierto' : 'cerrado'
}

/** Día de la semana (0–6) de un día calendario `YYYY-MM-DD`, sin depender de la zona horaria. */
export function diaSemanaDeFecha(ymd: string): number {
  const [a, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

/** ¿El negocio cierra el día (Bogotá) de este instante? `false` si no hay horario configurado. */
export function negocioCerradoEseDia(horarios: TramoHorario[] | null | undefined, instante: Date | string | null | undefined): boolean {
  if (!instante) return false
  return estadoDia(horarios, diaSemanaDeFecha(diaEntregaBogota(new Date(instante)))) === 'cerrado'
}

const tramosTexto = (ts: TramoHorario[]) => ts.map((t) => `${t.desde}–${t.hasta}`).join(' y ')

/** Líneas legibles agrupando días consecutivos iguales: «Lun–Vie 06:00–12:00 y 14:00–20:00», «Dom cerrado». */
export function resumenHorario(horarios: TramoHorario[] | null | undefined): string[] {
  if (!horarios || horarios.length === 0) return []
  const porDia = ORDEN_DIAS.map((d) => ({ d, txt: tramosTexto(normalizarHorario(horarios.filter((t) => t.diaSemana === d))) || 'cerrado' }))
  const lineas: string[] = []
  let i = 0
  while (i < porDia.length) {
    let j = i
    while (j + 1 < porDia.length && porDia[j + 1].txt === porDia[i].txt) j++
    const rango = i === j ? DIAS_CORTOS[porDia[i].d] : `${DIAS_CORTOS[porDia[i].d]}–${DIAS_CORTOS[porDia[j].d]}`
    lineas.push(`${rango} ${porDia[i].txt}`)
    i = j + 1
  }
  return lineas
}
