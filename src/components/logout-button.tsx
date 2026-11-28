'use client'

import { useRef, useState, type ComponentProps } from 'react'
import { logoutSafely } from '@/lib/session-cleanup'
import { AUTH_LOGOUT_STATE_EVENT, type LogoutStateDetail } from '@/lib/auth-events'
import { useSession } from 'next-auth/react'
import { SessionChangedError } from '@/lib/session-status'

export function LogoutButton({ children, ...props }: Omit<ComponentProps<'button'>, 'onClick' | 'disabled'>) {
  const { data: session } = useSession()
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const leave = async (expectedSessionId: string | undefined) => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    const announce = (busy: boolean) => window.dispatchEvent(new CustomEvent<LogoutStateDetail>(AUTH_LOGOUT_STATE_EVENT, { detail: { pending: busy, retry: () => { void leave(expectedSessionId) } } }))
    announce(true)
    try {
      if (!expectedSessionId) throw new SessionChangedError()
      await logoutSafely(expectedSessionId)
    } catch (error) {
      // A queued/retried intent from A must not close a later account B.
      if (error instanceof SessionChangedError) window.location.reload()
      else announce(false)
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <>
      <button {...props} type="button" disabled={pending} onClick={() => { void leave(session?.user?.sessionId) }}>
        {pending ? 'Cerrando sesión…' : children}
      </button>
    </>
  )
}
