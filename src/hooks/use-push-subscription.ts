'use client'

import { useCallback, useEffect, useState } from 'react'

export interface UsePushSubscriptionReturn {
  supported: boolean
  permission: NotificationPermission | 'unknown'
  subscribed: boolean
  loading: boolean
  error: string | null
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

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

export function usePushSubscription(): UsePushSubscriptionReturn {
  const [supported] = useState<boolean>(isPushSupported)
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supported) return

    setPermission(Notification.permission)

    let cancelled = false
    const checkSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (!cancelled) {
          setSubscribed(!!subscription)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error leyendo suscripcion activa')
        }
      }
    }

    void checkSubscription()
    return () => {
      cancelled = true
    }
  }, [supported])

  const subscribe = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      const newPermission = await Notification.requestPermission()
      setPermission(newPermission)

      if (newPermission === 'denied') {
        setError('Permiso de notificaciones denegado')
        setLoading(false)
        return
      }

      let publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        const response = await fetch('/api/push/vapid-public-key')
        if (!response.ok) {
          throw new Error('No se pudo obtener la clave VAPID')
        }
        const data = (await response.json()) as { publicKey: string | null }
        publicKey = data.publicKey ?? undefined
      }

      if (!publicKey) {
        setError('Clave VAPID no configurada')
        setLoading(false)
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      const json = subscription.toJSON()
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          },
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Error registrando suscripcion: ${response.status} ${text}`)
      }

      setSubscribed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error suscribiendo notificaciones')
    } finally {
      setLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await subscription.unsubscribe()

        const response = await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })

        if (!response.ok) {
          const text = await response.text()
          throw new Error(`Error eliminando suscripcion: ${response.status} ${text}`)
        }
      }

      setSubscribed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cancelando suscripcion')
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    supported,
    permission,
    subscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  }
}
