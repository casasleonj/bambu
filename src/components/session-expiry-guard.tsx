'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import type { Session } from 'next-auth'
import { getSessionTransportState, SESSION_TRANSPORT_EVENT } from '@/lib/session-transport'
import { SessionRecoveryCard } from '@/components/session-recovery-card'
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_STATE_EVENT, isIntentionalSignOut, type LogoutStateDetail } from '@/lib/auth-events'

const PUBLIC_PATHS = ['/login', '/login/redirect', '/offline']

/**
 * Pure helper: decide if the user should be redirected to login.
 * Exported for unit testing.
 */
export function shouldRedirectOnUnauth(
  pathname: string,
  status: string,
  session: Session | null | undefined,
): boolean {
  if (status === 'loading' || session?.authStatus === 'unavailable') return false
  if (PUBLIC_PATHS.includes(pathname)) return false
  // Usuario cerró sesión intencionalmente; Auth.js maneja el redirect limpio.
  if (isIntentionalSignOut) return false
  if (status === 'unauthenticated') return true
  if (!session?.user?.id) return true
  return false
}

function subscribeTransport(listener: () => void) {
  window.addEventListener(SESSION_TRANSPORT_EVENT, listener)
  return () => window.removeEventListener(SESSION_TRANSPORT_EVENT, listener)
}

/** A stale 401 or a failed Provider fetch is a reason to verify, not proof of expiry. */
export function SessionExpiryGuard() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const hasRedirected = useRef(false)
  const pending = useRef(false)
  const updateRef = useRef(update)
  const initialIdentity = useRef<string | null>(null)
  const [recovery, setRecovery] = useState<'idle' | 'unavailable'>('idle')
  const logoutRef = useRef(false)
  const [logout, setLogout] = useState<LogoutStateDetail | null>(null)
  const transport = useSyncExternalStore(subscribeTransport, getSessionTransportState, () => 'unknown')
  useEffect(() => {
    const recovered = () => {
      if (getSessionTransportState() === 'valid') setRecovery('idle')
    }
    window.addEventListener(SESSION_TRANSPORT_EVENT, recovered)
    return () => window.removeEventListener(SESSION_TRANSPORT_EVENT, recovered)
  }, [])
  useEffect(() => { updateRef.current = update }, [update])
  useEffect(() => {
    if (logout?.pending || !session?.user?.id || session.authStatus === 'unavailable') return
    const identity = `${session.user.id}:${session.user.sessionId ?? ''}:${session.user.role ?? ''}`
    if (initialIdentity.current && initialIdentity.current !== identity) {
      // Context alone cannot replace server-rendered props or another user's drafts.
      window.location.reload()
    }
    initialIdentity.current = identity
  }, [session, logout])

  const verify = useCallback(async () => {
    if (logoutRef.current || pending.current || hasRedirected.current || PUBLIC_PATHS.includes(pathname) || isIntentionalSignOut) return
    pending.current = true
    try {
      const fresh = await updateRef.current()
      if (logoutRef.current) return
      const result = getSessionTransportState()
      if (fresh?.authStatus === 'unavailable' || result === 'unavailable') {
        setRecovery('unavailable')
      } else if (fresh?.user?.id) {
        setRecovery('idle')
      } else if (fresh?.authStatus === 'invalid' || result === 'invalid') {
        hasRedirected.current = true
        router.replace('/login?reason=expired')
      } else {
        setRecovery('unavailable')
      }
    } catch {
      setRecovery('unavailable')
    } finally {
      pending.current = false
    }
  }, [pathname, router])

  useEffect(() => {
    if (logout) return
    if (session?.authStatus === 'unavailable' || transport === 'unavailable') return
    if (transport !== 'invalid' && !shouldRedirectOnUnauth(pathname, status, session)) return
    // Let the SDK commit its snapshot before asking it to refresh again.
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void verify() })
    return () => { cancelled = true }
  }, [pathname, status, session, transport, verify, logout])

  useEffect(() => {
    const check = () => { if (!logout) void verify() }
    window.addEventListener(AUTH_EXPIRED_EVENT, check)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, check)
  }, [verify, logout])

  useEffect(() => {
    const changed = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail: unknown = event.detail
      if (detail && typeof detail === 'object' && 'pending' in detail && typeof detail.pending === 'boolean' && 'retry' in detail && typeof detail.retry === 'function') {
        logoutRef.current = true
        setLogout(detail as LogoutStateDetail)
      }
    }
    window.addEventListener(AUTH_LOGOUT_STATE_EVENT, changed)
    return () => window.removeEventListener(AUTH_LOGOUT_STATE_EVENT, changed)
  }, [])

  const checking = status === 'loading' || (status === 'unauthenticated' && transport !== 'unavailable') || session?.authStatus === 'invalid' || transport === 'invalid'
  const showRecovery = checking || transport === 'unavailable' || session?.authStatus === 'unavailable' || recovery === 'unavailable'
  useEffect(() => {
    if (!showRecovery || checking || logout) return
    const retry = () => {
      if (navigator.onLine && document.visibilityState === 'visible') void verify()
    }
    const timer = setInterval(retry, 5000)
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', retry)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', retry)
    }
  }, [showRecovery, checking, logout, verify])

  if (PUBLIC_PATHS.includes(pathname)) return null
  if (logout) return <SessionRecoveryCard overlay logout checking={logout.pending} onRetry={logout.retry} />
  return showRecovery ? <SessionRecoveryCard overlay checking={checking} onRetry={() => { void verify() }} /> : null
}
