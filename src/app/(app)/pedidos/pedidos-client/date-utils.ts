export function getFechaOffset(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

export function getInicioSemana(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Lunes
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export function getInicioMes(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().split('T')[0]
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
    const fecha = item.fecha.slice(0, 10)
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
