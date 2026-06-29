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
  dismiss: () => void
  loading: boolean
  error: string | null
}

export function usePushOptIn(): UsePushOptInReturn {
  const { data: session } = useSession()
  const { permission, subscribe, loading } = usePushSubscription()
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [shownThisSession, setShownThisSession] = useState(false)

  useEffect(() => {
    setDismissed(safeLocalGet(DISMISSED_KEY) === '1')
    setShownThisSession(safeSessionGet(SHOWN_SESSION_KEY) === '1')
  }, [])

  const role = (session?.user as { role?: string } | undefined)?.role
  const isTargetRole = role ? TARGET_ROLES.has(role) : false
  const isIosWithoutStandalone = isIosDevice() && !isStandaloneMode()

  const shouldShow =
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

  return {
    shouldShow,
    accept,
    dismiss,
    loading,
    error,
  }
}
