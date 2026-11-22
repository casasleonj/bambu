'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { FechaColombia } from '@/components/ui/fecha-colombia'
import { getTodayString } from '@/lib/dates'
import { rangoHistorico } from '@/lib/rangos-historicos'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'

interface DateRangeFilterProps {
  onDateChange?: (desde: string | null, hasta: string | null) => void
  syncWithUrl?: boolean
  /** Muestra DD/MM/AAAA sin modificar otros módulos que usan el filtro. */
  formatoColombia?: boolean
  /** Oculta consultas a futuro: gastos registrados, nunca previsiones. */
  soloHistorico?: boolean
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatDateISO(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function getDayLabel(date: Date): string {
  return DAY_NAMES[date.getDay()]
}

function getNextBusinessDay(date: Date): Date {
  const tomorrow = new Date(date)
  tomorrow.setDate(tomorrow.getDate() + 1)
  // Skip Sunday
  while (tomorrow.getDay() === 0) {
    tomorrow.setDate(tomorrow.getDate() + 1)
  }
  return tomorrow
}

const SHORTCUTS = [
  { label: 'Hoy', getDate: () => new Date() },
  { label: 'Mañana', getDate: () => getNextBusinessDay(new Date()) },
  { label: 'Esta semana', getDate: () => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d } },
]

export function DateRangeFilter({ onDateChange, syncWithUrl = true, formatoColombia = false, soloHistorico = false }: DateRangeFilterProps) {
  const params = useShallowSearchParams()
  const idDesde = useId()
  const idHasta = useId()
  const hoyBogota = getTodayString()

  const [desde, setDesde] = useState(params.get('desde') || '')
  const [hasta, setHasta] = useState(params.get('hasta') || '')

  const updateUrl = useCallback((d: string, h: string) => {
    if (!syncWithUrl) return
    params.set({
      desde: d || undefined,
      hasta: h || undefined,
    }, { history: 'push' })
  }, [params, syncWithUrl])

  useEffect(() => {
    onDateChange?.(desde || null, hasta || null)
  }, [desde, hasta, onDateChange])

  function handleDesdeChange(value: string) {
    setDesde(value)
    updateUrl(value, hasta)
  }

  function handleHastaChange(value: string) {
    setHasta(value)
    updateUrl(desde, value)
  }

  function handleShortcut(target: Date) {
    const iso = formatDateISO(target)
    setDesde(iso)
    setHasta(iso)
    updateUrl(iso, iso)
  }

  function handleRangoHistorico(opcion: 'HOY' | 'AYER' | 'SEMANA') {
    const rango = rangoHistorico(opcion, hoyBogota)
    setDesde(rango.desde)
    setHasta(rango.hasta)
    updateUrl(rango.desde, rango.hasta)
  }

  function handleClear() {
    setDesde('')
    setHasta('')
    if (syncWithUrl) {
      params.set({ desde: undefined, hasta: undefined }, { history: 'push' })
    }
  }

  const hasFilter = desde || hasta

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <label htmlFor={idDesde} className="text-sm text-gray-600 whitespace-nowrap">Desde:</label>
        {formatoColombia
          ? <FechaColombia id={idDesde} value={desde} max={soloHistorico ? hoyBogota : undefined} onChange={handleDesdeChange} />
          : <input id={idDesde} type="date" value={desde} max={soloHistorico ? hoyBogota : undefined}
              onChange={(e) => handleDesdeChange(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />}

      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={idHasta} className="text-sm text-gray-600 whitespace-nowrap">Hasta:</label>
        {formatoColombia
          ? <FechaColombia id={idHasta} value={hasta} max={soloHistorico ? hoyBogota : undefined} onChange={handleHastaChange} />
          : <input id={idHasta} type="date" value={hasta} max={soloHistorico ? hoyBogota : undefined}
              onChange={(e) => handleHastaChange(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />}

      </div>
      <div className="flex gap-1">
        {soloHistorico ? (
          <>
            {([
              { opcion: 'HOY', label: 'Hoy' },
              { opcion: 'AYER', label: 'Ayer' },
              { opcion: 'SEMANA', label: 'Esta semana' },
            ] as const).map(({ opcion, label }) => {
              const rango = rangoHistorico(opcion, hoyBogota)
              return (
                <button key={opcion} type="button" onClick={() => handleRangoHistorico(opcion)}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition ${
                    desde === rango.desde && hasta === rango.hasta
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {label}
                </button>
              )
            })}
          </>
        ) : SHORTCUTS.map((s) => {
          const target = s.getDate()
          const label = s.label === 'Mañana'
            ? `Mañana (${getDayLabel(target)})`
            : s.label
          return (
            <button
              key={s.label}
              onClick={() => handleShortcut(target)}
              className={`px-2 py-1 text-xs font-medium rounded-lg transition ${
                desde === formatDateISO(target) && hasta === formatDateISO(target)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {hasFilter && (
        <button
          onClick={handleClear}
          className="text-sm text-red-600 hover:text-red-800 font-medium px-2 py-1"
        >
          Limpiar
        </button>
      )}
      {hasFilter && (
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          Filtrado
        </span>
      )}
    </div>
  )
}
