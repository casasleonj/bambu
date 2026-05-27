'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'

export interface ClienteSearchOption {
  id: string
  nombre: string
  apellido?: string
  telefono: string
  direccion: string | null
  barrio: string | null
  nombreNegocio?: string
}

interface PedidosSearchProps {
  clientes: ClienteSearchOption[]
  selectedClienteId: string | null
  onClienteSelect: (clienteId: string | null) => void
  searchInput: string
  onSearchChange: (value: string) => void
  placeholder?: string
}

export function PedidosSearch({
  clientes,
  selectedClienteId,
  onClienteSelect,
  searchInput,
  onSearchChange,
  placeholder = 'Buscar por cliente, #pedido o teléfono...',
}: PedidosSearchProps) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedCliente = useMemo(() => {
    if (!selectedClienteId) return null
    return clientes.find(c => c.id === selectedClienteId) ?? null
  }, [selectedClienteId, clientes])

  const hasLetters = useMemo(() => /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(searchInput), [searchInput])

  const filteredClientes = useMemo(() => {
    if (!searchInput || !hasLetters) return []
    const q = searchInput.toLowerCase()
    return clientes
      .filter(
        c =>
          c.nombre.toLowerCase().includes(q) ||
          (c.apellido || '').toLowerCase().includes(q) ||
          c.telefono.includes(q) ||
          (c.barrio || '').toLowerCase().includes(q) ||
          (c.direccion || '').toLowerCase().includes(q) ||
          (c.nombreNegocio || '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [clientes, searchInput, hasLetters])

  const showDropdown = open && !selectedCliente && hasLetters && filteredClientes.length > 0

  const handleSelect = useCallback(
    (id: string) => {
      onClienteSelect(id)
      setOpen(false)
      setHighlightedIndex(-1)
      inputRef.current?.blur()
    },
    [onClienteSelect]
  )

  const handleClear = useCallback(() => {
    onClienteSelect(null)
    onSearchChange('')
    inputRef.current?.focus()
  }, [onClienteSelect, onSearchChange])

  const handleInputChange = useCallback(
    (value: string) => {
      if (selectedCliente) {
        onClienteSelect(null)
      }
      onSearchChange(value)
      setOpen(true)
      setHighlightedIndex(-1)
    },
    [selectedCliente, onClienteSelect, onSearchChange]
  )

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
        if (showDropdown) {
          setHighlightedIndex(prev => Math.min(prev + 1, filteredClientes.length - 1))
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (showDropdown) {
          setHighlightedIndex(prev => Math.max(prev - 1, -1))
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (showDropdown && highlightedIndex >= 0 && highlightedIndex < filteredClientes.length) {
          handleSelect(filteredClientes[highlightedIndex].id)
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    },
    [showDropdown, filteredClientes, highlightedIndex, handleSelect]
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
          value={selectedCliente ? selectedCliente.nombre : searchInput}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => {
            if (!selectedCliente && searchInput) setOpen(true)
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

      {showDropdown && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {filteredClientes.map((c, i) => (
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
                {c.nombre}{c.apellido ? ` ${c.apellido}` : ''}
                {c.nombreNegocio && <span className="text-gray-500 font-normal ml-1">— {c.nombreNegocio}</span>}
              </p>
              <p className="text-xs text-gray-500">
                {c.telefono}
                {c.barrio && ` · ${c.barrio}`}
                {c.direccion && ` · ${c.direccion}`}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
