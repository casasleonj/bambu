'use client'

import { DateRangeFilter } from '@/components/date-range-filter'
import { ESTADOS, TIPOS } from './types'

interface PedidoFiltersProps {
  searchInput: string
  onSearchChange: (value: string) => void
  filtroEstado: string[]
  filtroTipo: string[]
  onUpdateFilter: (key: string, value: string) => void
  onDateChange: (desde: string | null, hasta: string | null) => void
}

export function PedidoFilters({
  searchInput,
  onSearchChange,
  filtroEstado,
  filtroTipo,
  onUpdateFilter,
  onDateChange,
}: PedidoFiltersProps) {
  return (
    <div className="bg-white p-4 rounded-xl shadow mb-6">
      <div className="flex flex-wrap gap-4 items-center">
        <DateRangeFilter onDateChange={onDateChange} />
        <input
          type="text"
          placeholder="Buscar por nombre, telefono o #pedido..."
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 min-w-64 px-4 py-2 border border-gray-300 rounded-lg"
        />
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Estado</span>
          {ESTADOS.map((estado) => (
            <button
              key={estado}
              onClick={() => onUpdateFilter('estado', estado)}
              className={`px-4 py-2.5 rounded-full text-sm transition ${
                filtroEstado.includes(estado)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {estado}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Tipo</span>
          {TIPOS.map((tipo) => (
            <button
              key={tipo}
              onClick={() => onUpdateFilter('tipo', tipo)}
              className={`px-4 py-2.5 rounded-full text-sm transition ${
                filtroTipo.includes(tipo)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tipo}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
