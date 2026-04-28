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

export function getTodayString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}
