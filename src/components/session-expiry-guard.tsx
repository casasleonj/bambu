'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import type { Session } from 'next-auth'
import { logger } from '@/lib/logger'
import { AUTH_EXPIRED_EVENT } from '@/lib/auth-events'

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
  if (status === 'loading') return false
  if (PUBLIC_PATHS.includes(pathname)) return false
  if (status === 'unauthenticated') return true
  if (!session?.user?.id) return true
  return false
}

/**
 * Global client-side guard that detects when the server has rejected the
 * session and redirects to /login immediately.
 *
 * Two complementary paths:
 * 1. SessionProvider polls `/api/auth/session` every 60s. When the JWT is
 *    invalidated server-side (expired, revoked, account deactivated) the hook
 *    becomes `unauthenticated` and we redirect.
 * 2. Interactive fetches may receive 401/403 before the next poll. They
 *    dispatch `app:auth:expired` and we redirect here.
 *
 * The `hasRedirected` ref ensures multiple 401s or rapid state changes do not
 * queue multiple redirects.
 */
export function SessionExpiryGuard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const hasRedirected = useRef(false)

  // Path 1: NextAuth session hook detected the session is no longer valid.
  useEffect(() => {
    if (!shouldRedirectOnUnauth(pathname, status, session)) return
    if (hasRedirected.current) return

    hasRedirected.current = true
    logger.info(
      { pathname, status },
      'SessionExpiryGuard: sesión expirada detectada por useSession, redirigiendo a login',
    )
    router.replace('/login?reason=expired')
  }, [session, status, pathname, router])

  // Path 2: A fetch received 401/403 and dispatched the auth:expired event.
  useEffect(() => {
    const handleExpired = () => {
      if (PUBLIC_PATHS.includes(pathname)) return
      if (hasRedirected.current) return

      hasRedirected.current = true
      logger.info(
        { pathname },
        'SessionExpiryGuard: evento auth:expired recibido, redirigiendo a login',
      )
      router.replace('/login?reason=expired')
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired)
  }, [pathname, router])

  return null
}
