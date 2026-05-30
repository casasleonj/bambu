'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { meetsMinSearchLength, MIN_SEARCH_CHARS } from '@/lib/cliente-search'

export interface SearchResult {
  id: string
  label: string
  subtitle?: string
  score?: number
}

interface SemanticSearchInputProps {
  /** API endpoint for search (e.g., '/api/search/clientes') */
  searchEndpoint: string
  /** Query param name (default 'q') */
  queryParam?: string
  /** Placeholder text */
  placeholder?: string
  /** Called when a result is selected */
  onSelect: (result: SearchResult) => void
  /** Currently selected item label (if any) */
  selectedLabel?: string
  /** Called to clear selection */
  onClear?: () => void
  /** Debounce delay in ms (default 300) */
  debounceMs?: number
  /** Max results to show (default 10) */
  maxResults?: number
  /** Custom render function for result items */
  renderResult?: (result: SearchResult) => React.ReactNode
  /** Additional CSS classes */
  className?: string
}

/**
 * Reusable semantic search input with:
 * - Minimum 2 characters requirement
 * - Debounced API calls
 * - Results ordered by relevance
 * - Loading state
 * - Keyboard navigation
 */
export function SemanticSearchInput({
  searchEndpoint,
  queryParam = 'q',
  placeholder = 'Buscar...',
  onSelect,
  selectedLabel,
  onClear,
  debounceMs = 300,
  maxResults = 10,
  renderResult,
  className = '',
}: SemanticSearchInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const meetsMinLength = useMemo(() => meetsMinSearchLength(query), [query])

  // Debounced search
  const triggerSearch = useCallback(
    (searchQuery: string) => {
      if (!meetsMinSearchLength(searchQuery)) {
        setResults([])
        setLoading(false)
        return
      }

      setLoading(true)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const url = `${searchEndpoint}?${queryParam}=${encodeURIComponent(searchQuery.trim())}&limit=${maxResults}`
          const res = await fetch(url)
          const json = await res.json()

          // Adapt response format based on endpoint
          let items: SearchResult[] = []
          if (json.data?.clientes) {
            items = json.data.clientes.map((c: any) => ({
              id: c.id,
              label: `${c.nombre}${c.apellido ? ` ${c.apellido}` : ''}`,
              subtitle: [c.telefono, c.barrio, c.direccion].filter(Boolean).join(' · '),
              score: c.similarity_score,
            }))
          } else if (json.data?.results) {
            items = json.data.results
          }

          setResults(items.slice(0, maxResults))
        } catch (error) {
          console.error('[SemanticSearchInput] Search error:', error)
          setResults([])
        } finally {
          setLoading(false)
        }
      }, debounceMs)
    },
    [searchEndpoint, queryParam, maxResults, debounceMs, meetsMinLength]
  )

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value)
      setOpen(true)
      setHighlightedIndex(-1)
      triggerSearch(value)
    },
    [triggerSearch]
  )

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onSelect(result)
      setOpen(false)
      setQuery('')
      setResults([])
      setHighlightedIndex(-1)
      inputRef.current?.blur()
    },
    [onSelect]
  )

  const handleClear = useCallback(() => {
    onClear?.()
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }, [onClear])

  // Close on outside click
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

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
        setHighlightedIndex(prev => Math.min(prev + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex])
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    },
    [results, highlightedIndex, handleSelect]
  )

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector(`[data-hl="${highlightedIndex}"]`)
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  const showDropdown = open && !selectedLabel
  const showMinLengthHint = open && !selectedLabel && !meetsMinLength && query.trim().length > 0
  const showNoResults = open && !selectedLabel && meetsMinLength && !loading && results.length === 0 && query.trim().length > 0

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={selectedLabel || query}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => {
            if (!selectedLabel && query) setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {selectedLabel && onClear && (
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
          {loading ? (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Buscando...
              </div>
            </div>
          ) : showMinLengthHint ? (
            <div className="px-3 py-2 text-xs text-gray-500 text-center">
              Escribe al menos {MIN_SEARCH_CHARS} caracteres para buscar...
            </div>
          ) : showNoResults ? (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">
              Sin resultados
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={result.id}
                data-hl={i}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`w-full text-left px-3 py-2 transition border-b last:border-b-0 ${
                  i === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                {renderResult ? (
                  renderResult(result)
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-900">{result.label}</p>
                    {result.subtitle && (
                      <p className="text-xs text-gray-500">{result.subtitle}</p>
                    )}
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
