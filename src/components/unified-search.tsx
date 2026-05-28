'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'

import { matchCliente } from '@/lib/cliente-search'

export interface ClienteOption {
  id: string
  nombre: string
  apellido: string | null
  telefono: string
  direccion: string | null
}

export interface FacturaOption {
  id: string
  numero: string
  clienteNombre: string | null
  fecha: string
}

export type UnifiedSelection =
  | { type: 'cliente'; id: string }
  | { type: 'factura'; id: string }
  | null

interface UnifiedSearchProps {
  clientes: ClienteOption[]
  facturas: FacturaOption[]
  selection: UnifiedSelection
  onChange: (selection: UnifiedSelection) => void
  placeholder?: string
}

export function UnifiedSearch({
  clientes,
  facturas,
  selection,
  onChange,
  placeholder = 'Buscar cliente o factura...',
}: UnifiedSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedLabel = useMemo(() => {
    if (!selection) return ''
    if (selection.type === 'cliente') {
      const c = clientes.find(x => x.id === selection.id)
      return c ? `${c.nombre} ${c.apellido || ''}`.trim() : ''
    }
    if (selection.type === 'factura') {
      const f = facturas.find(x => x.id === selection.id)
      return f ? `#${f.numero}` : ''
    }
    return ''
  }, [selection, clientes, facturas])

  const filteredClientes = useMemo(() => {
    if (!query) return clientes.slice(0, 5)
    return clientes
      .filter(c => matchCliente(c, query))
      .slice(0, 5)
  }, [clientes, query])

  const filteredFacturas = useMemo(() => {
    if (!query) return facturas.slice(0, 5)
    const q = query.toLowerCase()
    return facturas
      .filter(
        f =>
          f.numero.toLowerCase().includes(q) ||
          (f.clienteNombre || '').toLowerCase().includes(q)
      )
      .slice(0, 5)
  }, [facturas, query])

  const totalResults = filteredClientes.length + filteredFacturas.length

  const handleSelectCliente = useCallback(
    (id: string) => {
      onChange({ type: 'cliente', id })
      setOpen(false)
      setQuery('')
      setHighlightedIndex(-1)
      inputRef.current?.blur()
    },
    [onChange]
  )

  const handleSelectFactura = useCallback(
    (id: string) => {
      onChange({ type: 'factura', id })
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
        setHighlightedIndex(prev => Math.min(prev + 1, totalResults - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredClientes.length) {
          handleSelectCliente(filteredClientes[highlightedIndex].id)
        } else if (highlightedIndex >= filteredClientes.length) {
          const fi = highlightedIndex - filteredClientes.length
          handleSelectFactura(filteredFacturas[fi].id)
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    },
    [filteredClientes, filteredFacturas, highlightedIndex, totalResults, handleSelectCliente, handleSelectFactura]
  )

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector(`[data-hl="${highlightedIndex}"]`)
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={selection ? selectedLabel : query}
          onChange={e => {
            if (selection) onChange(null)
            setQuery(e.target.value)
            setOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={() => {
            if (!selection) setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {selection && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            aria-label="Limpiar selecci\u00f3n"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && !selection && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {totalResults === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">
              {query ? 'Sin resultados' : 'Escribe para buscar...'}
            </div>
          ) : (
            <>
              {filteredClientes.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                    Clientes
                  </div>
                  {filteredClientes.map((c, i) => (
                    <button
                      key={c.id}
                      data-hl={i}
                      onClick={() => handleSelectCliente(c.id)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={`w-full text-left px-3 py-2 transition ${
                        i === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {c.nombre} {c.apellido || ''}
                      </p>
                      <p className="text-xs text-gray-500">{c.telefono}</p>
                    </button>
                  ))}
                </div>
              )}
              {filteredFacturas.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
                    Facturas
                  </div>
                  {filteredFacturas.map((f, i) => {
                    const idx = filteredClientes.length + i
                    return (
                      <button
                        key={f.id}
                        data-hl={idx}
                        onClick={() => handleSelectFactura(f.id)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`w-full text-left px-3 py-2 transition ${
                          idx === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                        } ${i > 0 ? 'border-t border-gray-100' : ''}`}
                      >
                        <p className="text-sm font-medium text-gray-900">
                          #{f.numero}
                        </p>
                        <p className="text-xs text-gray-500">
                          {f.clienteNombre || 'N/A'} —{' '}
                          {new Date(f.fecha).toLocaleDateString('es-CO')}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
