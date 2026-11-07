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

/** Estado del intento de activación, para pintar la franja y el panel de la campana. */
export type PushOptInStatus = 'idle' | 'activating' | 'success' | 'error'

/** Cuánto se ve el «Listo: notificaciones activadas» antes de cerrarse sola. */
const SUCCESS_VISIBLE_MS = 2500

export interface UsePushOptInReturn {
  /** Regla base de la franja: aún no se decidió y no se descartó. Ver `stripVisible` para lo que se pinta. */
  shouldShow: boolean
  /** La franja se pinta: la regla base, o un intento de activación en curso / con resultado. */
  stripVisible: boolean
  /** Campana del encabezado: se puede activar, pero la franja no está a la vista. */
  showBell: boolean
  /** Punto naranja de la campana: nunca se descartó con «✕». */
  bellHasDot: boolean
  status: PushOptInStatus
  /** El navegador bloqueó las notificaciones; la app no puede revertirlo. */
  blocked: boolean
  /** El intento de activación nació en el panel de la campana: ahí se muestran sus estados. */
  panelActive: boolean
  /** Cierra el resultado (éxito o error) de un intento sin cambiar las preferencias. */
  clearAttempt: () => void
  /** «Activar» desde el panel de la campana (los estados se muestran en el panel, no en la franja). */
  acceptFromPanel: () => Promise<void>
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
  const { permission, subscribe, loading, subscribed, error: subscriptionError } = usePushSubscription()
  const [error, setError] = useState<string | null>(null)
  // `attempted`: la persona pulsó «Activar» y el resultado (éxito o error) sigue a la vista.
  const [attempted, setAttempted] = useState(false)
  const [attemptOrigin, setAttemptOrigin] = useState<'strip' | 'panel'>('strip')

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

  const runAccept = useCallback(
    async (origin: 'strip' | 'panel') => {
      setError(null)
      setAttemptOrigin(origin)
      setAttempted(true)
      try {
        await subscribe()
        if (Notification.permission === 'granted') {
          safeLocalSet(ACCEPTED_KEY, '1')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error activando notificaciones')
      }
    },
    [subscribe],
  )
  const accept = useCallback(() => runAccept('strip'), [runAccept])
  const acceptFromPanel = useCallback(() => runAccept('panel'), [runAccept])

  const clearAttempt = useCallback(() => {
    setAttempted(false)
    setError(null)
  }, [])

  const dismiss = useCallback(() => {
    safeLocalSet(DISMISSED_KEY, '1')
    safeSessionSet(SHOWN_SESSION_KEY, '1')
    setDismissed(true)
    setShownThisSession(true)
    clearAttempt()
  }, [clearAttempt])

  // "Más tarde": solo oculta el toast por lo que resta de esta sesión
  // (sessionStorage). A diferencia de dismiss(), NO escribe el flag
  // permanente en localStorage, para que el opt-in pueda volver a
  // ofrecerse en la próxima sesión (spec §7.1, paso 9).
  const remindLater = useCallback(() => {
    safeSessionSet(SHOWN_SESSION_KEY, '1')
    setShownThisSession(true)
    clearAttempt()
  }, [clearAttempt])

  // Resultado del intento. Los errores de la suscripción (clave VAPID ausente,
  // tiempo agotado, permiso denegado) viven en `usePushSubscription`; antes no
  // se mostraban en ningún lado.
  const succeeded = attempted && subscribed && !loading
  const errorMessage = attempted ? (error ?? subscriptionError) : null
  const status: PushOptInStatus = loading
    ? 'activating'
    : succeeded
      ? 'success'
      : errorMessage
        ? 'error'
        : 'idle'

  // El «Listo» se cierra solo; el setState va en el callback del timer, no en el efecto.
  useEffect(() => {
    if (!succeeded) return
    const timer = setTimeout(() => setAttempted(false), SUCCESS_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [succeeded])

  const panelActive = status !== 'idle' && attemptOrigin === 'panel'
  const stripVisible = shouldShow || (status !== 'idle' && attemptOrigin === 'strip')
  // La campana sigue mientras un intento nacido en su panel muestra su resultado, aunque el
  // permiso ya haya cambiado a granted/denied.
  const showBell =
    mounted &&
    isTargetRole &&
    !isIosWithoutStandalone &&
    ((permission === 'default' && !stripVisible) || panelActive)

  return {
    shouldShow,
    stripVisible,
    showBell,
    bellHasDot: !dismissed,
    status,
    blocked: permission === 'denied',
    panelActive,
    clearAttempt,
    accept,
    acceptFromPanel,
    dismiss,
    remindLater,
    loading,
    error,
  }
}
