'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { normalizeName } from '@/lib/import/normalizer'

export interface BarrioOption {
  id: string
  nombre: string
}

interface BarriosSearchResponse {
  success: boolean
  data?: BarrioOption[]
}

interface BarrioCreateResponse {
  success: boolean
  barrio?: BarrioOption
  error?: { message?: string }
}

interface BarrioSelectProps {
  /** Barrio canónico vinculado hoy (null si el registro es legacy, sin barrioId). */
  value: BarrioOption | null
  /** Texto legacy actual (Cliente/Negocio.barrio) — se muestra cuando `value` es null. */
  legacyNombre?: string
  onSelect: (barrio: BarrioOption) => void
  /**
   * Edición directa del string legacy (sin pasar por el catálogo canónico).
   * Requerido para no romper el flujo existente: un registro legacy
   * (barrio!=null, barrioId=null) debe seguir siendo editable como texto
   * libre, igual que antes de F1 — "vincular" es una acción aparte, no
   * obligatoria.
   */
  onManualChange: (value: string) => void
  placeholder?: string
}

/**
 * Selector/buscador de Barrio canónico (F1 — ALS Barrio/Zona, ajuste
 * aprobado). Búsqueda determinista contra GET /api/barrios (sin fuzzy
 * matching). Crear un barrio nuevo llama a POST /api/barrios — el backend
 * vuelve a validar la unicidad (409 si otro usuario lo creó primero); este
 * componente nunca asume que su propia búsqueda previa es suficiente.
 */
export function BarrioSelect({ value, legacyNombre, onSelect, onManualChange, placeholder = 'Buscar barrio...' }: BarrioSelectProps) {
  const [modoVinculo, setModoVinculo] = useState(false)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [results, setResults] = useState<BarrioOption[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      fetch(`/api/barrios?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data: BarriosSearchResponse) => {
          if (data.success && data.data) setResults(data.data)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, isOpen])

  const handleSelect = useCallback((barrio: BarrioOption) => {
    onSelect(barrio)
    setIsOpen(false)
    setModoVinculo(false)
    setQuery('')
    setError('')
  }, [onSelect])

  const handleCrear = useCallback(async () => {
    const nombre = query.trim()
    if (!nombre) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/barrios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      })
      const data: BarrioCreateResponse = await res.json().catch(() => ({ success: false }))
      if (res.ok && data.success && data.barrio) {
        handleSelect(data.barrio)
        return
      }
      if (res.status === 409) {
        // Carrera: otro usuario lo creó primero. Re-buscamos y, si aparece
        // un match exacto, lo usamos en vez de fallar en seco.
        const retry = await fetch(`/api/barrios?q=${encodeURIComponent(nombre)}`)
        const retryData: BarriosSearchResponse = await retry.json().catch(() => ({ success: false }))
        const exacto = retryData.data?.find((b) => normalizeName(b.nombre) === normalizeName(nombre))
        if (exacto) {
          handleSelect(exacto)
          return
        }
      }
      setError(data.error?.message || 'No se pudo crear el barrio')
    } catch {
      setError('No se pudo crear el barrio (sin conexión)')
    } finally {
      setCreating(false)
    }
  }, [query, handleSelect])

  const exactMatch = results.find((r) => normalizeName(r.nombre) === normalizeName(query))
  const showCrear = query.trim() !== '' && !exactMatch && !loading

  // Estado "vinculado": ya hay un Barrio canónico.
  if (value && !modoVinculo) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-700">
          {value.nombre}
        </span>
        <button
          type="button"
          onClick={() => { setModoVinculo(true); setIsOpen(true); setQuery('') }}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline shrink-0"
        >
          Cambiar
        </button>
      </div>
    )
  }

  // Estado "legacy sin vincular": hay texto libre pero no barrioId. Se
  // mantiene EDITABLE como texto libre (no rompe el flujo pre-F1: vincular
  // a un Barrio canónico es una acción aparte, no obligatoria — ver ALS
  // §5 "Registros legacy").
  if (!modoVinculo && legacyNombre !== undefined) {
    return (
      <div className="space-y-1.5">
        <input
          type="text"
          value={legacyNombre}
          onChange={(e) => onManualChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
        />
        {legacyNombre && (
          <button
            type="button"
            onClick={() => { setModoVinculo(true); setIsOpen(true); setQuery(legacyNombre) }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
          >
            Vincular a barrio canónico
          </button>
        )}
      </div>
    )
  }

  // Estado "búsqueda" (sin valor, sin legacy, o cambiando/vinculando).
  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setIsOpen(true) }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
        autoComplete="off"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full border border-gray-200 rounded-lg bg-white shadow-lg max-h-56 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2.5 text-sm text-gray-400">Buscando...</div>
          )}
          {!loading && results.length === 0 && query === '' && (
            <div className="px-3 py-2.5 text-sm text-gray-400">Escribe para buscar...</div>
          )}
          {!loading && results.map((barrio) => (
            <button
              key={barrio.id}
              type="button"
              onClick={() => handleSelect(barrio)}
              className="w-full text-left px-3 py-2.5 text-sm border-b last:border-b-0 border-gray-100 text-gray-700 hover:bg-gray-50 transition"
            >
              {barrio.nombre}
            </button>
          ))}
          {showCrear && (
            <button
              type="button"
              onClick={handleCrear}
              disabled={creating}
              className="w-full text-left px-3 py-2.5 text-sm text-blue-600 font-medium border-t border-gray-100 hover:bg-blue-50 transition disabled:opacity-50"
            >
              {creating ? 'Creando...' : `+ Crear "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
