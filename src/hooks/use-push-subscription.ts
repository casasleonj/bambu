'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UsePushSubscriptionReturn {
  supported: boolean
  permission: NotificationPermission | 'unknown'
  setPermission: (permission: NotificationPermission | 'unknown') => void
  subscribed: boolean
  loading: boolean
  recovering: boolean
  error: string | null
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

const DEFAULT_TIMEOUT_MS = 10_000

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function isPushSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window
}

async function fetchVapidPublicKey(): Promise<string | undefined> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (publicKey) return publicKey

  const response = await fetch('/api/push/vapid-public-key')
  if (!response.ok) {
    throw new Error('No se pudo obtener la clave VAPID')
  }
  const data = (await response.json()) as { publicKey: string | null }
  return data.publicKey ?? undefined
}

/**
 * fetch con timeout via AbortController.
 *
 * Si la request tarda mas de timeoutMs, se aborta y fetch arroja un AbortError.
 * Esto evita que el boton se quede pegado en "Procesando..." indefinidamente
 * en conexiones 2G/3G o cuando el servidor no responde.
 */
async function fetchWithTimeout(
  controller: AbortController,
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('La conexion tardo demasiado', 'TimeoutError'))
  }, timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

export function usePushSubscription(): UsePushSubscriptionReturn {
  const [supported] = useState<boolean>(isPushSupported)
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>(() => {
    if (!isPushSupported() || typeof Notification === 'undefined') return 'unknown'
    return Notification.permission
  })
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const performSubscribe = useCallback(async (isRecovery: boolean) => {
    // Si ya hay una operacion en curso (manual o recovery), no iniciar otra.
    // Esto previene race conditions si el usuario clickea varias veces o si
    // React StrictMode monta/desmonta el componente.
    if (abortRef.current) {
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    if (!isRecovery) {
      setLoading(true)
    } else {
      setRecovering(true)
    }
    if (!isRecovery) {
      setError(null)
    }

    try {
      const publicKey = await fetchVapidPublicKey()

      if (!publicKey) {
        if (!isRecovery) {
          setError('Clave VAPID no configurada')
        }
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      const json = subscription.toJSON()
      const response = await fetchWithTimeout(
        controller,
        '/api/push/subscribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: json.keys?.p256dh,
              auth: json.keys?.auth,
            },
          }),
        },
      )

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Error registrando suscripcion: ${response.status} ${text}`)
      }

      setSubscribed(true)
    } catch (err) {
      // Si fue abortado, distinguimos timeout (mostramos error) de unmount (silencio).
      if (controller.signal.aborted) {
        const isTimeout = err instanceof DOMException && err.name === 'TimeoutError'
        if (isTimeout && !isRecovery) {
          setError('La conexion tardo demasiado. Intenta de nuevo.')
        }
        return
      }
      // En auto-recovery fallamos silenciosamente para no asustar al usuario
      // que recien abre la pantalla. El boton "Restaurar" queda disponible.
      if (!isRecovery) {
        setError(err instanceof Error ? err.message : 'Error suscribiendo notificaciones')
      }
    } finally {
      if (!isRecovery) {
        setLoading(false)
      } else {
        setRecovering(false)
      }
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!supported) return

    const checkSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()

        const hasSubscription = !!subscription
        setSubscribed(hasSubscription)

        if (!hasSubscription && Notification.permission === 'granted') {
          await performSubscribe(true)
        }
      } catch {
        // Errores de auto-recovery son silenciosos. El usuario puede reintentar manualmente.
      }
    }

    void checkSubscription()
    return () => {
      // Abortamos cualquier operacion en curso al desmontar (StrictMode-safe).
      abortRef.current?.abort()
    }
  }, [supported, performSubscribe])

  const subscribe = useCallback(async () => {
    setError(null)

    try {
      const newPermission = await Notification.requestPermission()
      setPermission(newPermission)

      if (newPermission === 'denied') {
        setError('Permiso de notificaciones denegado')
        return
      }

      await performSubscribe(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error suscribiendo notificaciones')
    }
  }, [performSubscribe])

  const unsubscribe = useCallback(async () => {
    if (abortRef.current) {
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setLoading(true)

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await subscription.unsubscribe()

        const response = await fetchWithTimeout(
          controller,
          '/api/push/unsubscribe',
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          },
        )

        if (!response.ok) {
          const text = await response.text()
          throw new Error(`Error eliminando suscripcion: ${response.status} ${text}`)
        }
      }

      setSubscribed(false)
    } catch (err) {
      if (controller.signal.aborted) {
        const isTimeout = err instanceof DOMException && err.name === 'TimeoutError'
        if (isTimeout) {
          setError('La conexion tardo demasiado. Intenta de nuevo.')
        }
        return
      }
      setError(err instanceof Error ? err.message : 'Error cancelando suscripcion')
    } finally {
      setLoading(false)
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [])

  return {
    supported,
    permission,
    setPermission,
    subscribed,
    loading,
    recovering,
    error,
    subscribe,
    unsubscribe,
  }
}
