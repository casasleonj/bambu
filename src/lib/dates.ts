const TIMEZONE = 'America/Bogota'

export function getTodayRange(): { startOfDay: Date; endOfDay: Date } {
  const now = new Date()
  const colombiaDate = now.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
  const startOfDay = new Date(colombiaDate + 'T00:00:00-05:00')
  const endOfDay = new Date(colombiaDate + 'T23:59:59.999-05:00')
  return { startOfDay, endOfDay }
}

export function getDateRange(start: string, end: string): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(start + 'T00:00:00-05:00'),
    endDate: new Date(end + 'T23:59:59.999-05:00'),
  }
}

export function getYesterdayRange(): { startOfDay: Date; endOfDay: Date } {
  const now = new Date()
  now.setDate(now.getDate() - 1)
  const colombiaDate = now.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
  const startOfDay = new Date(colombiaDate + 'T00:00:00-05:00')
  const endOfDay = new Date(colombiaDate + 'T23:59:59.999-05:00')
  return { startOfDay, endOfDay }
}

export function getTodayString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

/**
 * FIX Fase 2 §3.3: helper unificado para "hoy en Bogotá" como string YYYY-MM-DD.
 * Reemplaza versiones naive con `setHours()` en el código de dominio.
 * `date-helpers.ts:todayInBogota()` también existe pero usa math manual;
 * este es la versión canónica.
 */
export function todayStringBogota(): string {
  return getTodayString()
}

/**
 * FIX Fase 2 §3.3: inicio del día en Bogotá a partir de un string YYYY-MM-DD.
 * Si no se pasa fecha, usa hoy en Bogotá.
 */
export function startOfDayBogota(fechaStr?: string): Date {
  const dateStr = fechaStr || getTodayString()
  return new Date(`${dateStr}T00:00:00-05:00`)
}

/**
 * FIX Fase 2 §3.3: fin del día en Bogotá a partir de un string YYYY-MM-DD.
 */
export function endOfDayBogota(fechaStr?: string): Date {
  const dateStr = fechaStr || getTodayString()
  return new Date(`${dateStr}T23:59:59.999-05:00`)
}

export function getNextBusinessDay(date: Date = new Date()): Date {
  const tomorrow = new Date(date)
  tomorrow.setDate(tomorrow.getDate() + 1)
  while (tomorrow.getDay() === 0) {
    tomorrow.setDate(tomorrow.getDate() + 1)
  }
  return tomorrow
}

export function getFechaOffset(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  if (dias > 0) {
    while (d.getDay() === 0) {
      d.setDate(d.getDate() + 1)
    }
  }
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

export function getEndOfWeek(date: Date = new Date()): Date {
  const end = new Date(date)
  end.setDate(end.getDate() + (6 - end.getDay()))
  return end
}

export type DatePreset = 'ayer' | 'hoy' | 'manana' | 'semana' | 'todos'

export function getPresetDate(preset: DatePreset): { desde: string; hasta: string } | null {
  if (preset === 'todos') return null
  
  const hoy = new Date()
  const hoyStr = hoy.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
  
  switch (preset) {
    case 'ayer': {
      const ayer = new Date(hoy)
      ayer.setDate(ayer.getDate() - 1)
      const ayerStr = ayer.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
      return { desde: ayerStr, hasta: ayerStr }
    }
    case 'hoy':
      return { desde: hoyStr, hasta: hoyStr }
    case 'manana': {
      const manana = getNextBusinessDay(hoy)
      const mananaStr = manana.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
      return { desde: mananaStr, hasta: mananaStr }
    }
    case 'semana': {
      const finSemana = getEndOfWeek(hoy)
      const finSemanaStr = finSemana.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
      return { desde: hoyStr, hasta: finSemanaStr }
    }
    default:
      return null
  }
}

export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00-05:00')
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export function getDayLabel(date: Date): string {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return days[date.getDay()]
}
