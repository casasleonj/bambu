'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface DateRangeFilterProps {
  onDateChange?: (desde: string | null, hasta: string | null) => void
  syncWithUrl?: boolean
}

export function DateRangeFilter({ onDateChange, syncWithUrl = true }: DateRangeFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [desde, setDesde] = useState(searchParams.get('desde') || '')
  const [hasta, setHasta] = useState(searchParams.get('hasta') || '')

  const updateUrl = useCallback((d: string, h: string) => {
    if (!syncWithUrl) return
    const params = new URLSearchParams(searchParams.toString())
    if (d) params.set('desde', d)
    else params.delete('desde')
    if (h) params.set('hasta', h)
    else params.delete('hasta')
    router.push(`?${params.toString()}`, { scroll: false })
  }, [router, searchParams, syncWithUrl])

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

  function handleClear() {
    setDesde('')
    setHasta('')
    if (syncWithUrl) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('desde')
      params.delete('hasta')
      router.push(`?${params.toString()}`, { scroll: false })
    }
  }

  const hasFilter = desde || hasta

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 whitespace-nowrap">Desde:</label>
        <input
          type="date"
          value={desde}
          onChange={(e) => handleDesdeChange(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 whitespace-nowrap">Hasta:</label>
        <input
          type="date"
          value={hasta}
          onChange={(e) => handleHastaChange(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
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
