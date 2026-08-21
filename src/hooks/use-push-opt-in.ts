'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { isIosDevice, isStandaloneMode } from '@/lib/pwa'

const ACCEPTED_KEY = 'push-opt-in-accepted'
const DISMISSED_KEY = 'push-opt-in-dismissed'
const SHOWN_SESSION_KEY = 'push-opt-in-shown-this-session'

const TARGET_ROLES = new Set(['ADMIN', 'ASISTENTE', 'CONTADOR'])

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // noop
  }
}

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // noop
  }
}

export interface UsePushOptInReturn {
  shouldShow: boolean
  accept: () => Promise<void>
  /** Descarte permanente (botón "Cerrar"): no vuelve a mostrarse en ninguna sesión futura. */
  dismiss: () => void
  /** Descarte de esta sesión (botón "Más tarde" / auto-dismiss): puede reaparecer en la próxima sesión. */
  remindLater: () => void
  loading: boolean
  error: string | null
}

export function usePushOptIn(): UsePushOptInReturn {
  const { data: session } = useSession()
  const { permission, subscribe, loading } = usePushSubscription()
  const [error, setError] = useState<string | null>(null)

  // dismissed/shownThisSession/isIosWithoutStandalone dependen de
  // localStorage/sessionStorage/navigator, que no existen durante SSR y
  // pueden diferir de lo que el server asume. Si se leen en el render
  // (via lazy useState initializer, como antes) o directo en el cuerpo del
  // hook, el primer render del cliente (hydration) puede no coincidir con
  // el HTML del server → React descarta el árbol entero y lo regenera
  // (hydration mismatch, visible en AppLayout completo, no solo el toast).
  // Fix: arrancar con el mismo valor determinístico que el server (false)
  // y resolver el valor real recién en un efecto post-mount.
  const [dismissed, setDismissed] = useState(false)
  const [shownThisSession, setShownThisSession] = useState(false)
  const [isIosWithoutStandalone, setIsIosWithoutStandalone] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDismissed(safeLocalGet(DISMISSED_KEY) === '1')
    setShownThisSession(safeSessionGet(SHOWN_SESSION_KEY) === '1')
    setIsIosWithoutStandalone(isIosDevice() && !isStandaloneMode())
    setMounted(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const role = (session?.user as { role?: string } | undefined)?.role
  const isTargetRole = role ? TARGET_ROLES.has(role) : false

  const shouldShow =
    mounted &&
    permission === 'default' &&
    isTargetRole &&
    !isIosWithoutStandalone &&
    !dismissed &&
    !shownThisSession

  const accept = useCallback(async () => {
    setError(null)
    try {
      await subscribe()
      if (Notification.permission === 'granted') {
        safeLocalSet(ACCEPTED_KEY, '1')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error activando notificaciones')
    }
  }, [subscribe])

  const dismiss = useCallback(() => {
    safeLocalSet(DISMISSED_KEY, '1')
    safeSessionSet(SHOWN_SESSION_KEY, '1')
    setDismissed(true)
    setShownThisSession(true)
  }, [])

  // "Más tarde": solo oculta el toast por lo que resta de esta sesión
  // (sessionStorage). A diferencia de dismiss(), NO escribe el flag
  // permanente en localStorage, para que el opt-in pueda volver a
  // ofrecerse en la próxima sesión (spec §7.1, paso 9).
  const remindLater = useCallback(() => {
    safeSessionSet(SHOWN_SESSION_KEY, '1')
    setShownThisSession(true)
  }, [])

  return {
    shouldShow,
    accept,
    dismiss,
    remindLater,
    loading,
    error,
  }
}
