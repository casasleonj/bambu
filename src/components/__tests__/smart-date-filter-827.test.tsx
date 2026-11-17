// @tests #827 — al abrir la página ya filtrada por fecha, el chip y el preset reflejan la URL (no «Invalid Date»).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SmartDateFilter } from '../smart-date-filter'
import { getPresetDate } from '@/lib/dates'

const url = { value: new URLSearchParams() }
vi.mock('@/hooks/use-shallow-search-params', () => ({
  useShallowSearchParams: () => ({ get: (k: string) => url.value.get(k), toString: () => url.value.toString(), set: vi.fn() }),
}))

const conUrl = (desde: string, hasta: string) => { url.value = new URLSearchParams({ desde, hasta }) }

describe('#827 SmartDateFilter montado con la URL ya filtrada', () => {
  beforeEach(() => { url.value = new URLSearchParams() })

  it('rango de hoy: el chip dice «Filtrado: Hoy», no «Invalid Date»', () => {
    const d = getPresetDate('hoy')!
    conUrl(d.desde, d.hasta)
    render(<SmartDateFilter defaultPreset="hoy" turnoLabel="Ayer y hoy" />)
    expect(screen.queryByText(/Invalid Date/)).toBeNull()
    expect(screen.getByText('Filtrado: Hoy')).toBeInTheDocument()
  })

  it('rango de ayer: el chip dice «Filtrado: Ayer»', () => {
    const d = getPresetDate('ayer')!
    conUrl(d.desde, d.hasta)
    render(<SmartDateFilter defaultPreset="hoy" turnoLabel="Ayer y hoy" />)
    expect(screen.queryByText(/Invalid Date/)).toBeNull()
    expect(screen.getByText('Filtrado: Ayer')).toBeInTheDocument()
  })

  it('rango personalizado: el chip muestra las dos fechas formateadas, no «Invalid Date»', () => {
    conUrl('2026-11-01', '2026-11-10')
    render(<SmartDateFilter defaultPreset="hoy" turnoLabel="Ayer y hoy" />)
    expect(screen.queryByText(/Invalid Date/)).toBeNull()
    expect(screen.getByText(/^Filtrado: .+ → .+$/)).toBeInTheDocument()
  })

  it('sin fechas en la URL no hay chip y no falla', () => {
    render(<SmartDateFilter defaultPreset="hoy" turnoLabel="Ayer y hoy" />)
    expect(screen.queryByText(/^Filtrado:/)).toBeNull()
  })
})
