'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface InAppAlertPayload {
  title?: string
  body?: string
  url?: string
}

export function InAppPushListener() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    let cancelled = false
    let handler: ((event: MessageEvent) => void) | null = null

    void navigator.serviceWorker.ready.then(() => {
      if (cancelled) return

      handler = (event: MessageEvent) => {
        if (event.data?.type !== 'in-app-alert') return
        if (!document.hasFocus()) return

        const payload = event.data.payload as InAppAlertPayload
        const url = payload.url

        toast(payload.title ?? 'Nueva alerta', {
          description: payload.body,
          duration: 10000,
          action: url
            ? {
                label: 'Ver caso',
                onClick: () => router.push(url),
              }
            : undefined,
        })
      }

      navigator.serviceWorker.addEventListener('message', handler)
    })

    return () => {
      cancelled = true
      if (handler) {
        navigator.serviceWorker.removeEventListener('message', handler)
      }
    }
  }, [router])

  return null
}
