/**
 * Helpers para manejo consistente de fechas en timezone America/Bogota.
 * NUNCA usar new Date('YYYY-MM-DD') directamente — siempre usar estos helpers.
 */

/**
 * Convierte un string YYYY-MM-DD a Date representando el inicio del día en Bogotá.
 * El Date resultante está en UTC pero representa 00:00:00-05:00.
 */
export function startOfDayInBogota(fechaStr: string): Date {
  return new Date(`${fechaStr}T00:00:00-05:00`)
}

/**
 * Convierte un string YYYY-MM-DD a Date representando el fin del día en Bogotá.
 */
export function endOfDayInBogota(fechaStr: string): Date {
  return new Date(`${fechaStr}T23:59:59.999-05:00`)
}

/**
 * Obtiene el string YYYY-MM-DD de hoy en Bogotá.
 */
export function todayInBogota(): string {
  const now = new Date()
  const bogotaOffset = -5 * 60 * 60 * 1000
  const bogotaTime = new Date(now.getTime() + bogotaOffset)
  return bogotaTime.toISOString().split('T')[0]
}

/**
 * Construye el rango de fecha para queries Prisma.
 */
export function dateRangeForDay(fechaStr: string): { gte: Date; lt: Date } {
  const start = startOfDayInBogota(fechaStr)
  const end = endOfDayInBogota(fechaStr)
  return { gte: start, lt: end }
}

/**
 * Obtiene la fecha/hora actual como Date, representando el momento exacto en Bogotá.
 * Equivalente a new Date() pero documenta explícitamente la zona horaria.
 */
export function nowInBogota(): Date {
  return new Date()
}
