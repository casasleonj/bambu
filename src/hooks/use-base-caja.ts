'use client'

import { useState, useEffect, useCallback } from 'react'
import { getTodayString } from '@/lib/dates'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'

function getTodayKey() {
  return getTodayString()
}

export function useBaseCaja() {
  const [baseDia, setBaseDiaState] = useState<string | null>(null)

  useEffect(() => {
    const todayKey = getTodayKey()
    const saved = localStorage.getItem(`baseDia_${todayKey}`)
    if (saved) setBaseDiaState(saved)

    const handler = (e: StorageEvent) => {
      if (e.key === `baseDia_${todayKey}`) {
        setBaseDiaState(e.newValue)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Cross-session sync: when another user updates BASE_DIA, refetch and update
  // localStorage (which also notifies other tabs via the storage event above).
  useRealtimeListener(['config.updated'], () => {
    const todayKey = getTodayKey()
    fetch(`/api/config?clave=BASE_DIA_${todayKey}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const valor = data?.config?.valor ?? null
        if (valor !== null) {
          localStorage.setItem(`baseDia_${todayKey}`, valor)
          setBaseDiaState(valor)
        }
      })
      .catch(() => {})
  })

  const setBaseDia = useCallback((val: string) => {
    const todayKey = getTodayKey()
    localStorage.setItem(`baseDia_${todayKey}`, val)
    setBaseDiaState(val)
    window.dispatchEvent(new StorageEvent('storage', { key: `baseDia_${todayKey}`, newValue: val }))
  }, [])

  const clearBaseDia = useCallback(() => {
    const todayKey = getTodayKey()
    localStorage.removeItem(`baseDia_${todayKey}`)
    setBaseDiaState(null)
  }, [])

  return { baseDia, setBaseDia, clearBaseDia }
}
