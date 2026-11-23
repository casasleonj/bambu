'use client'

import { useRef, useState, type ComponentProps } from 'react'
import { logoutSafely } from '@/lib/session-cleanup'
import { AUTH_LOGOUT_STATE_EVENT, type LogoutStateDetail } from '@/lib/auth-events'

export function LogoutButton({ children, ...props }: Omit<ComponentProps<'button'>, 'onClick' | 'disabled'>) {
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const leave = async () => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    const announce = (busy: boolean) => window.dispatchEvent(new CustomEvent<LogoutStateDetail>(AUTH_LOGOUT_STATE_EVENT, { detail: { pending: busy, retry: () => { void leave() } } }))
    announce(true)
    try {
      await logoutSafely()
    } catch {
      announce(false)
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <>
      <button {...props} type="button" disabled={pending} onClick={() => { void leave() }}>
        {pending ? 'Cerrando sesión…' : children}
      </button>
    </>
  )
}
