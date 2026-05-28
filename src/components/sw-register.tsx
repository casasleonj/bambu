'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Purge all service worker caches and notify the SW to clean up.
 * Call this before signOut to prevent stale authenticated HTML from
 * being served to the next user on the same device.
 */
export async function purgeSWCache(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('caches' in window)) return

  // Delete all cache entries
  const names = await caches.keys()
  await Promise.all(names.map((name) => caches.delete(name)))

  // Tell the service worker to skip waiting (activates new version without stale cache)
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'PURGE_CACHE' })
  }
}

export function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })
      waitingWorker.addEventListener('statechange', (e) => {
        if ((e.target as ServiceWorker).state === 'activated') {
          window.location.reload()
        }
      })
    }
  }, [waitingWorker])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Development: unregister any existing SW to avoid stale cache
    if (process.env.NODE_ENV === 'development') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          reg.unregister().then(() => {
            console.log('[DEV] SW unregistered:', reg.scope)
          })
        }
      })
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

    // Production: register with update handling
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check if there's already a waiting worker
      if (reg.waiting) {
        setUpdateAvailable(true)
        setWaitingWorker(reg.waiting)
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true)
            setWaitingWorker(newWorker)
          }
        })
      })
    }).catch((err) => {
      if (process.env.NODE_ENV === 'test') return
      console.error('SW registration failed:', err)
    })

    // Handle SW updates via skipWaiting message
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  }, [])

  return (
    <>
      {updateAvailable && (
        <div className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <span className="text-sm">Nueva versión disponible</span>
          <button
            onClick={handleUpdate}
            className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium"
          >
            Actualizar
          </button>
        </div>
      )}
    </>
  )
}
