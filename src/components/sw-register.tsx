'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg?.scope) {
          console.log('SW registered:', reg.scope)
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'test') return
        console.error('SW registration failed:', err)
      })
  }, [])

  return null
}
