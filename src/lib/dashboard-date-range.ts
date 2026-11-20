/** Global dashboard date selection. Calendar days are interpreted in America/Bogota (UTC-05:00). */
export type DashboardDateRange = { start: Date; end: Date; from: string; to: string }
const DAY_MS = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDay(value: string): Date {
  const match = DATE_RE.exec(value)
  if (!match) throw new Error('Fecha inválida: use AAAA-MM-DD')
  const [, year, month, day] = match
  const parsed = new Date(`${year}-${month}-${day}T00:00:00-05:00`)
  if (!Number.isFinite(parsed.getTime()) ||
    parsed.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) !== value) {
    throw new Error('Fecha de calendario inválida')
  }
  return parsed
}

export function dashboardDateRange(from: string, to = from): DashboardDateRange {
  const start = parseDay(from)
  const lastDay = parseDay(to)
  if (lastDay < start) throw new Error('El fin del rango no puede preceder al inicio')
  // Limit expensive accidental full-history queries; can be relaxed after profiling.
  if ((+lastDay - +start) / DAY_MS > 365) throw new Error('El rango máximo es de 366 días')
  return { start, end: new Date(+lastDay + DAY_MS), from, to }
}

export function dashboardToday(now = new Date()): DashboardDateRange {
  const day = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return dashboardDateRange(day)
}

export function dashboardPreviousPeriod(range: DashboardDateRange): DashboardDateRange {
  const duration = +range.end - +range.start
  const start = new Date(+range.start - duration)
  const end = range.start
  return {
    start, end,
    from: start.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
    to: new Date(+end - DAY_MS).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
  }
}
