'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface TipoNegocioSelectProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TipoNegocioSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar tipo de negocio...',
}: TipoNegocioSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [allOptions, setAllOptions] = useState<string[]>(options)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const queryRef = useRef(query)
  queryRef.current = query
  const skipFocusRef = useRef(false)

  useEffect(() => {
    fetch('/api/clientes/tipos-negocio')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.tipos) {
          const merged = Array.from(new Set([...options, ...data.tipos])).sort()
          setAllOptions(merged)
        }
      })
      .catch(() => {})
  }, [options])

  const filteredOptions = query === ''
    ? allOptions
    : allOptions.filter(o => o.toLowerCase().includes(query.toLowerCase()))

  const hasMatch = filteredOptions.length > 0
  const showAddOption = query !== '' && !hasMatch

  const displayItems = showAddOption
    ? [...filteredOptions, `+ Agregar "${query}"`]
    : filteredOptions

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback((item: string) => {
    if (item.startsWith('+ Agregar')) {
      onChange(queryRef.current)
    } else {
      onChange(item)
    }
    setIsOpen(false)
    setHighlightedIndex(-1)
    setQuery('')
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange('')
    setQuery('')
    setIsOpen(false)
    setHighlightedIndex(-1)
    skipFocusRef.current = true
    inputRef.current?.focus()
  }, [onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setHighlightedIndex(0)
      } else {
        setHighlightedIndex(prev => Math.min(prev + 1, displayItems.length - 1))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (isOpen) {
        setHighlightedIndex(prev => Math.max(prev - 1, 0))
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (isOpen && highlightedIndex >= 0) {
        handleSelect(displayItems[highlightedIndex])
      } else {
        setIsOpen(true)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setHighlightedIndex(-1)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? query : (value || '')}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!isOpen) setIsOpen(true)
            setHighlightedIndex(0)
          }}
          onFocus={() => {
            if (skipFocusRef.current) {
              skipFocusRef.current = false
            } else if (value) {
              setQuery(value)
            }
            setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          autoComplete="off"
        />
        {value && !isOpen && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition"
            aria-label="Limpiar selección"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full border border-gray-200 rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto"
        >
          {displayItems.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-gray-400">
              Escribe para buscar...
            </div>
          ) : (
            displayItems.map((item, idx) => {
              const isAddOption = item.startsWith('+ Agregar')
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left px-3 py-2.5 text-sm border-b last:border-b-0 transition ${
                    idx === highlightedIndex
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50'
                  } ${isAddOption ? 'text-blue-600 font-medium border-t border-gray-100' : 'text-gray-700'}`}
                >
                  {item}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
