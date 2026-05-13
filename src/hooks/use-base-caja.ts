'use client'

import { useState, useEffect } from 'react'

function getTodayKey() {
  return new Date().toISOString().split('T')[0]
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

  const setBaseDia = (val: string) => {
    const todayKey = getTodayKey()
    localStorage.setItem(`baseDia_${todayKey}`, val)
    setBaseDiaState(val)
    window.dispatchEvent(new StorageEvent('storage', { key: `baseDia_${todayKey}`, newValue: val }))
  }

  const clearBaseDia = () => {
    const todayKey = getTodayKey()
    localStorage.removeItem(`baseDia_${todayKey}`)
    setBaseDiaState(null)
  }

  return { baseDia, setBaseDia, clearBaseDia }
}
