'use client'

import { useEffect, useState } from 'react'

export function UpdateNotification() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // En dev no mostramos el toast de actualización ni recargamos la página:
    // - El plugin de Serwist está desactivado en dev (next.config.ts), por lo
    //   que no hay un SW nuevo que instalar.
    // - Defensa en profundidad: si un SW quedó registrado de una sesión
    //   anterior con NEXTAUTH_URL distinto, evitamos el reload() en cascada.
    // - `controllerchange` solo importa en producción, donde el usuario SÍ
    //   debe refrescar para tomar la nueva versión del SW.
    if (process.env.NODE_ENV !== 'production') return

    let refreshing = false

    // Detect when a new service worker is waiting.
    // `{ once: true }` evita memory leak en HMR (patrón de Workbox/Chrome docs:
    // https://developer.chrome.com/docs/workbox/handling-service-worker-updates).
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      },
      { once: true },
    )

    navigator.serviceWorker.ready.then((registration) => {
      // Check if there's a waiting worker immediately
      if (registration.waiting) {
        setShow(true)
      }

      // Listen for new workers entering the waiting state
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version is waiting
            setShow(true)
          }
        })
      })
    })
  }, [])

  const handleUpdate = () => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        // Tell the waiting worker to skip waiting and activate
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
    })
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5">
      <div className="text-sm">
        <p className="font-semibold">Actualización disponible</p>
        <p className="text-blue-100 text-xs">Hay una nueva versión de la app</p>
      </div>
      <button
        onClick={handleUpdate}
        className="px-3 py-1.5 bg-white text-blue-600 text-sm font-semibold rounded-md hover:bg-blue-50 transition"
      >
        Actualizar
      </button>
    </div>
  )
}
