const TIMEZONE = 'America/Bogota'

export function getFechaOffset(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

export function getInicioSemana(): string {
  const d = new Date()
  const dayOfWeek = d.getDay()
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

export function getInicioMes(): string {
  const d = new Date()
  d.setDate(1)
  return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

export type PeriodoFiltro = 'todos' | 'hoy' | 'ayer' | 'semana' | 'mes'

export const PERIODOS: { key: PeriodoFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
]

export function filtrarPorPeriodo<T extends { fecha: string }>(
  items: T[],
  periodo: PeriodoFiltro
): T[] {
  if (periodo === 'todos') return items

  const hoy = getFechaOffset(0)
  const ayer = getFechaOffset(-1)
  const inicioSemana = getInicioSemana()
  const inicioMes = getInicioMes()

  return items.filter((item) => {
    const fecha = item.fecha
      ? new Date(item.fecha).toLocaleDateString('en-CA', { timeZone: TIMEZONE })
      : ''
    switch (periodo) {
      case 'hoy':
        return fecha === hoy
      case 'ayer':
        return fecha === ayer
      case 'semana':
        return fecha >= inicioSemana
      case 'mes':
        return fecha >= inicioMes
      default:
        return true
    }
  })
}
