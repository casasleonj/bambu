'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Development: unregister any existing SW to avoid stale cache
    // when switching branches or worktrees (feat-8-week-impl -> main)
    if (process.env.NODE_ENV === 'development') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          reg.unregister().then(() => {
            console.log('[DEV] SW unregistered:', reg.scope)
          })
        }
      })
      // Also clear caches to remove stale assets from other branches
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name).then(() => {
              console.log('[DEV] Cache deleted:', name)
            })
          }
        })
      }
      return
    }

    // Production: register normally
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
