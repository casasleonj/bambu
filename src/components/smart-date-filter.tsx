'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DatePreset,
  getPresetDate,
  getNextBusinessDay,
  getEndOfWeek,
  getDayLabel,
  formatDateLabel,
} from '@/lib/dates'

interface SmartDateFilterProps {
  onDateChange?: (desde: string | null, hasta: string | null) => void
}

type FilterMode = 'preset' | 'custom'

export function SmartDateFilter({ onDateChange }: SmartDateFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<FilterMode>('preset')
  const [activePreset, setActivePreset] = useState<DatePreset | null>(null)
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')
  const [isCustomExpanded, setIsCustomExpanded] = useState(false)

  const desdeUrl = searchParams.get('desde')
  const hastaUrl = searchParams.get('hasta')
  const allUrl = searchParams.get('all') === 'true'

  const syncFromUrl = useCallback(() => {
    const presets: { preset: DatePreset; desde: string; hasta: string }[] = [
      { preset: 'ayer', ...getPresetDate('ayer')! },
      { preset: 'hoy', ...getPresetDate('hoy')! },
      { preset: 'manana', ...getPresetDate('manana')! },
      { preset: 'semana', ...getPresetDate('semana')! },
    ]

    const match = presets.find(
      (p) => p.desde === desdeUrl && p.hasta === hastaUrl
    )

    if (allUrl) {
      // "Limpiar" deja la URL sin fechas y con ?all=true.
      setActivePreset('todos')
      setMode('preset')
      setIsCustomExpanded(false)
    } else if (match) {
      setActivePreset(match.preset)
      setMode('preset')
      setIsCustomExpanded(false)
    } else if (!desdeUrl && !hastaUrl) {
      // Default a hoy si no hay filtro de fecha en la URL.
      setActivePreset('hoy')
      setMode('preset')
      setIsCustomExpanded(false)
    } else {
      setActivePreset(null)
      setMode('custom')
      setCustomDesde(desdeUrl || '')
      setCustomHasta(hastaUrl || '')
      setIsCustomExpanded(true)
    }
  }, [desdeUrl, hastaUrl, allUrl])

  useEffect(() => {
    syncFromUrl()
  }, [syncFromUrl])

  // Default a "Hoy" al montar si no hay filtro de fecha en la URL
  // y no se ha pedido explícitamente "Todos" con ?all=true.
  // Esto hace que SmartDateFilter sea la única fuente de verdad del
  // filtro default y evita duplicar la lógica en los consumidores.
  useEffect(() => {
    if (!desdeUrl && !hastaUrl && !allUrl) {
      const dates = getPresetDate('hoy')
      if (dates) {
        updateUrl(dates.desde, dates.hasta, false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateUrl = useCallback(
    (desde: string | null, hasta: string | null, all: boolean) => {
      const params = new URLSearchParams(searchParams.toString())

      if (desde) params.set('desde', desde)
      else params.delete('desde')

      if (hasta) params.set('hasta', hasta)
      else params.delete('hasta')

      if (all) params.set('all', 'true')
      else params.delete('all')

      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const handlePresetClick = (preset: DatePreset) => {
    if (preset === 'todos') {
      // "Limpiar": quita el filtro de fecha y deja ?all=true para que
      // el consumidor sepa que debe traer todo el histórico.
      updateUrl(null, null, true)
      setActivePreset('todos')
      setMode('preset')
      setIsCustomExpanded(false)
      return
    }

    const dates = getPresetDate(preset)
    if (dates) {
      updateUrl(dates.desde, dates.hasta, false)
      setActivePreset(preset)
      setMode('preset')
      setIsCustomExpanded(false)
    }
  }

  const handleCustomApply = () => {
    if (customDesde && customHasta) {
      updateUrl(customDesde, customHasta, false)
      setActivePreset(null)
      setMode('custom')
    }
  }

  const handleCustomClear = () => {
    setCustomDesde('')
    setCustomHasta('')
    // Limpiar quita el filtro de fecha y deja ?all=true.
    updateUrl(null, null, true)
    setActivePreset('todos')
    setMode('preset')
    setIsCustomExpanded(false)
  }

  const toggleCustom = () => {
    if (!isCustomExpanded) {
      setIsCustomExpanded(true)
      if (desdeUrl) setCustomDesde(desdeUrl)
      if (hastaUrl) setCustomHasta(hastaUrl)
    } else {
      setIsCustomExpanded(false)
    }
  }

  useEffect(() => {
    onDateChange?.(desdeUrl || null, hastaUrl || null)
  }, [desdeUrl, hastaUrl, onDateChange])

  const presets: { key: DatePreset; label: string; getDate: () => Date }[] = [
    {
      key: 'ayer',
      label: '← Ayer',
      getDate: () => {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        return d
      },
    },
    {
      key: 'hoy',
      label: 'Hoy',
      getDate: () => new Date(),
    },
    {
      key: 'manana',
      label: `Mañana (${getDayLabel(getNextBusinessDay())}) →`,
      getDate: () => getNextBusinessDay(),
    },
    {
      key: 'semana',
      label: 'Esta Semana',
      getDate: () => getEndOfWeek(),
    },
  ]

  const hasFilter = desdeUrl || hastaUrl

  return (
    <div className="space-y-3">
      {/* Navegación rápida */}
      <div className="flex items-center gap-2 flex-wrap">
        {presets.map((preset) => {
          const isActive =
            mode === 'preset' && activePreset === preset.key
          const target = preset.getDate()
          const label =
            preset.key === 'manana'
              ? `Mañana (${getDayLabel(target)}) →`
              : preset.label

          return (
            <button
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          )
        })}

        {/* Toggle personalizado */}
        <button
          onClick={toggleCustom}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition inline-flex items-center gap-1 ${
            mode === 'custom' || isCustomExpanded
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <span>Personalizado</span>
          <svg
            className={`w-4 h-4 transition-transform ${isCustomExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {hasFilter && mode === 'preset' && activePreset !== 'todos' && (
          <button
            onClick={() => handlePresetClick('todos')}
            className="text-sm text-red-600 hover:text-red-800 font-medium px-2 py-1"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Rango personalizado (expandible) */}
      {isCustomExpanded && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">
                Desde:
              </label>
              <input
                type="date"
                value={customDesde}
                onChange={(e) => setCustomDesde(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">
                Hasta:
              </label>
              <input
                type="date"
                value={customHasta}
                onChange={(e) => setCustomHasta(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCustomApply}
                disabled={!customDesde || !customHasta}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                ✓ Aplicar
              </button>
              <button
                onClick={handleCustomClear}
                className="px-3 py-1.5 text-red-600 hover:text-red-800 text-sm font-medium transition"
              >
                × Limpiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Badge de estado */}
      {hasFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {mode === 'preset' && activePreset
              ? `Filtrado: ${getPresetLabel(activePreset)}`
              : `Filtrado: ${formatDateLabel(customDesde)} → ${formatDateLabel(customHasta)}`}
          </span>
        </div>
      )}
    </div>
  )
}

function getPresetLabel(preset: DatePreset): string {
  switch (preset) {
    case 'ayer':
      return 'Ayer'
    case 'hoy':
      return 'Hoy'
    case 'manana':
      return 'Mañana'
    case 'semana':
      return 'Esta Semana'
    case 'todos':
      return 'Todos'
    default:
      return ''
  }
}
