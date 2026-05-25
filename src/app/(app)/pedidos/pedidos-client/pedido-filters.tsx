'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DateRangeFilter } from '@/components/date-range-filter'
import { TIPOS, ORIGENES, ESTADOS_ENTREGA, ESTADOS_PAGO } from './types'

interface PedidoFiltersProps {
  searchInput: string
  onSearchChange: (value: string) => void
  filtroTipo: string[]
  filtroOrigen: string[]
  filtroEstadoEntrega: string[]
  filtroEstadoPago: string[]
  onUpdateFilter: (key: string, value: string) => void
  onDateChange?: (desde: string | null, hasta: string | null) => void
  hideDateFilter?: boolean
}

const FILTERS_KEY = 'pedidos-filters-expanded'

const filterGroups = [
  { key: 'origen', label: 'Origen', values: ORIGENES, active: (f: string[]) => f },
  { key: 'estadoEntrega', label: 'Entrega', values: ESTADOS_ENTREGA, active: (f: string[]) => f },
  { key: 'estadoPago', label: 'Pago', values: ESTADOS_PAGO, active: (f: string[]) => f },
  { key: 'tipo', label: 'Tipo', values: TIPOS, active: (f: string[]) => f },
]

const activeColors: Record<string, string> = {
  origen: 'bg-purple-600 text-white',
  estadoEntrega: 'bg-blue-600 text-white',
  estadoPago: 'bg-amber-600 text-white',
  tipo: 'bg-emerald-600 text-white',
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

export function PedidoFilters({
  searchInput,
  onSearchChange,
  filtroTipo,
  filtroOrigen,
  filtroEstadoEntrega,
  filtroEstadoPago,
  onUpdateFilter,
  onDateChange,
  hideDateFilter = false,
}: PedidoFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(FILTERS_KEY) === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem(FILTERS_KEY, String(expanded))
  }, [expanded])

  const activeFiltersCount =
    filtroTipo.length +
    filtroOrigen.length +
    filtroEstadoEntrega.length +
    filtroEstadoPago.length

  const activeMap: Record<string, string[]> = {
    origen: filtroOrigen,
    estadoEntrega: filtroEstadoEntrega,
    estadoPago: filtroEstadoPago,
    tipo: filtroTipo,
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow mb-6">
      {/* Fila superior compacta — siempre visible */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        {!hideDateFilter && (
          <div className="shrink-0">
            <DateRangeFilter onDateChange={onDateChange} />
          </div>
        )}
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono o #pedido..."
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 min-w-0 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          aria-expanded={expanded}
        >
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filtros</span>
          {activeFiltersCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold text-white bg-blue-600 rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Pills de filtros activos (siempre visibles si hay) */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
          {filterGroups.flatMap((group) =>
            activeMap[group.key].map((value) => (
              <span
                key={`${group.key}-${value}`}
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
              >
                <span className="text-gray-400">{group.label}:</span>
                {formatLabel(value)}
                <button
                  onClick={() => onUpdateFilter(group.key, value)}
                  className="ml-0.5 p-0.5 hover:bg-gray-200 rounded-full transition"
                  aria-label={`Quitar filtro ${group.label} ${formatLabel(value)}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            ))
          )}
          <button
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString())
              const keys = ['origen', 'estadoEntrega', 'estadoPago', 'tipo']
              keys.forEach((k) => params.delete(k))
              router.push(`?${params.toString()}`, { scroll: false })
            }}
            className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Panel colapsable */}
      <div
        className={`grid transition-all duration-200 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-3 pt-3 border-t border-gray-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          {/* Desktop: chips en grid compacto */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {filterGroups.map((group) => (
              <div key={group.key}>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {group.values.map((value) => {
                    const isActive = activeMap[group.key].includes(value)
                    return (
                      <button
                        key={value}
                        onClick={() => onUpdateFilter(group.key, value)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                          isActive
                            ? activeColors[group.key]
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {formatLabel(value)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: <details> nativo por categoría */}
          <div className="md:hidden space-y-2">
            {filterGroups.map((group) => {
              const activeCount = activeMap[group.key].length
              return (
                <details key={group.key} className="group border border-gray-200 rounded-lg overflow-hidden">
                  <summary className="flex items-center justify-between px-3 py-2.5 bg-gray-50 cursor-pointer list-none select-none">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-2">
                      {activeCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold text-white bg-blue-600 rounded-full">
                          {activeCount}
                        </span>
                      )}
                      <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </summary>
                  <div className="px-3 py-2.5 flex flex-wrap gap-1.5 bg-white">
                    {group.values.map((value) => {
                      const isActive = activeMap[group.key].includes(value)
                      return (
                        <button
                          key={value}
                          onClick={() => onUpdateFilter(group.key, value)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                            isActive
                              ? activeColors[group.key]
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {formatLabel(value)}
                        </button>
                      )
                    })}
                  </div>
                </details>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
