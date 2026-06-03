'use client'

/**
 * ProduccionPendingBadge — badge flotante que muestra cuántas Producciones
 * están pendientes de sincronizar en la cola offline (Dexie.requestQueue).
 *
 * Solo aparece cuando hay >=1 item con localEndpoint === 'produccion'.
 * Se actualiza cada 5s (poll barato) y después de cada sync.
 *
 * En tests Playwright, no se muestra (serviceWorkers: 'block' + polling skip).
 */

import { useEffect, useState } from 'react'
import { offlineDb } from '@/lib/db/offline'

const POLL_MS = 5000
const ENDPOINT = 'produccion'

export function ProduccionPendingBadge() {
  const [count, setCount] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const updateCount = async () => {
      try {
        const all = await offlineDb.requestQueue.toArray()
        const filtered = all.filter((r) => r.localEndpoint === ENDPOINT)
        setCount(filtered.length)
      } catch {
        // Dexie no disponible (SSR, etc.) — no mostrar
      }
    }
    void updateCount()
    // Solo polleamos en el browser
    if (typeof window === 'undefined') return
    const id = setInterval(updateCount, POLL_MS)
    return () => clearInterval(id)
  }, [])

  if (!mounted || count === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="produccion-pending-badge"
      className="flex items-center gap-2 bg-yellow-50 border-2 border-yellow-400 text-yellow-900 px-3 py-2 rounded-lg text-sm font-medium shadow-sm"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>
        {count} producción{count === 1 ? '' : 'es'} pendiente{count === 1 ? '' : 's'} de sincronizar
      </span>
    </div>
  )
}
