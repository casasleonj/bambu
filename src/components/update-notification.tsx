'use client'

import { useEffect, useState } from 'react'
import { useSerwist } from '@serwist/turbopack/react'

/**
 * BUG (ago 2026): el botón "Actualizar" no hacía nada. Causa raíz:
 * `src/app/sw.ts` tiene `skipWaiting: true`, lo que hace que el nuevo SW
 * pase por el estado "waiting" en menos de 200ms (WAITING_TIMEOUT_DURATION,
 * @serwist/window/src/Serwist.ts) y active en segundo plano sin quedar
 * expuesto de forma estable en `registration.waiting`. La versión anterior
 * de este componente dependía enteramente de `registration.waiting` tanto
 * para detectar la actualización como para el click de "Actualizar"
 * (`registration.waiting.postMessage(...)`) — con este SW ese objeto es
 * casi siempre `null`/`undefined` para actualizaciones propias, así que el
 * guard `if (!registration.waiting) return` convertía el botón en un no-op
 * silencioso.
 *
 * Fix: usar la instancia `Serwist` (@serwist/window) ya registrada por
 * `<SerwistProvider>` en el layout raíz vía `useSerwist()`, y escuchar su
 * evento `activated` con `isUpdate: true` — se dispara cuando el nuevo SW
 * reemplazó a uno anterior y YA quedó activo (aunque, por `clientsClaim:
 * false`, todavía no controle esta pestaña). Como el SW ya está activo
 * (no "waiting"), no hay a quién mandarle `SKIP_WAITING`: el botón
 * simplemente recarga la página — una navegación fresca siempre queda
 * controlada por el SW activo más reciente, con o sin `clientsClaim`.
 * `useSerwist()` ya resuelve `serwist=null` en dev/Playwright (prop
 * `disable` en `src/app/layout.tsx`), así que no hace falta repetir el
 * guard de `NODE_ENV` acá.
 */
export function UpdateNotification() {
  const { serwist } = useSerwist()
  const [show, setShow] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (!serwist) return

    const onActivated = (event: { isUpdate?: boolean }) => {
      if (event.isUpdate) {
        setShow(true)
      }
    }

    serwist.addEventListener('activated', onActivated)
    return () => serwist.removeEventListener('activated', onActivated)
  }, [serwist])

  const handleUpdate = () => {
    setUpdating(true)
    window.location.reload()
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
        disabled={updating}
        data-testid="update-notification-button"
        className="px-3 py-1.5 bg-white text-blue-600 text-sm font-semibold rounded-md hover:bg-blue-50 transition disabled:opacity-70"
      >
        {updating ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  )
}
