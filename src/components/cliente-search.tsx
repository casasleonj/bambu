'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'

export interface ClienteSearchOption {
  id: string
  nombre: string
  telefono: string
  direccion: string | null
  barrio: string | null
}

interface ClienteSearchProps {
  clientes: ClienteSearchOption[]
  selectedId: string | null
  onChange: (clienteId: string | null) => void
  placeholder?: string
}

export function ClienteSearch({
  clientes,
  selectedId,
  onChange,
  placeholder = 'Buscar cliente...',
}: ClienteSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedCliente = useMemo(() => {
    if (!selectedId) return null
    return clientes.find(c => c.id === selectedId) ?? null
  }, [selectedId, clientes])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return clientes
      .filter(
        c =>
          c.nombre.toLowerCase().includes(q) ||
          c.telefono.includes(q) ||
          (c.barrio || '').toLowerCase().includes(q) ||
          (c.direccion || '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [clientes, query])

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id)
      setOpen(false)
      setQuery('')
      setHighlightedIndex(-1)
      inputRef.current?.blur()
    },
    [onChange]
  )

  const handleClear = useCallback(() => {
    onChange(null)
    setQuery('')
    inputRef.current?.focus()
  }, [onChange])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
        setHighlightedIndex(prev => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          handleSelect(filtered[highlightedIndex].id)
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    },
    [filtered, highlightedIndex, handleSelect]
  )

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector(`[data-hl="${highlightedIndex}"]`)
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={selectedCliente ? selectedCliente.nombre : query}
          onChange={e => {
            if (selectedCliente) onChange(null)
            setQuery(e.target.value)
            setOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={() => {
            if (!selectedCliente) setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {selectedCliente && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            aria-label="Limpiar selección"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && !selectedCliente && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">
              {query ? 'Sin resultados' : 'Escribe para buscar...'}
            </div>
          ) : (
            <>
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  data-hl={i}
                  onClick={() => handleSelect(c.id)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={`w-full text-left px-3 py-2 transition border-b last:border-b-0 ${
                    i === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">
                    {c.nombre}
                  </p>
                  <p className="text-xs text-gray-500">
                    {c.telefono}
                    {c.barrio && ` · ${c.barrio}`}
                    {c.direccion && ` · ${c.direccion}`}
                  </p>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
