'use client'

import { useState, useEffect } from 'react'

export function useBaseCaja() {
  const [baseDia, setBaseDiaState] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('baseDia')
    if (saved) setBaseDiaState(saved)

    const handler = (e: StorageEvent) => {
      if (e.key === 'baseDia') {
        setBaseDiaState(e.newValue)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const setBaseDia = (val: string) => {
    localStorage.setItem('baseDia', val)
    setBaseDiaState(val)
    window.dispatchEvent(new StorageEvent('storage', { key: 'baseDia', newValue: val }))
  }

  return { baseDia, setBaseDia }
}
