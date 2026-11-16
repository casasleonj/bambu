'use client'

import { useContext, useEffect, useRef } from 'react'
import { RealtimeContext } from '@/components/realtime-provider'
import type { RealtimeEvent } from '@/lib/realtime'

/**
 * Convenience hook: subscribe to realtime event filters and invoke a callback
 * whenever a matching event arrives. De-duplicates rapid events by a short
 * window so multiple updates in a burst collapse into a single refetch.
 *
 * If there is no RealtimeProvider in the tree (e.g. in unit tests), the hook
 * silently does nothing instead of throwing.
 */
export function useRealtimeListener(
  filters: string[],
  callback: (event: RealtimeEvent) => void,
  options: { debounceMs?: number } = {},
) {
  const subscribe = useContext(RealtimeContext)?.subscribe
  const callbackRef = useRef(callback)
  // Los consumidores pasan arrays inline. Su contenido define la suscripción,
  // no su identidad ni el status cambiante del contexto (#779).
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const debounceMs = options.debounceMs ?? 500
  useEffect(() => {
    if (!subscribe) return undefined
    const subscriptionFilters = JSON.parse(filtersKey) as string[]
    if (subscriptionFilters.length === 0) return undefined
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending: RealtimeEvent | null = null

    const unsubscribe = subscribe(subscriptionFilters, (event) => {
      if (!active) return
      pending = event
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (active && pending) {
          const latest = pending
          pending = null
          callbackRef.current(latest)
        }
      }, debounceMs)
    })
    return () => {
      active = false
      clearTimeout(timer)
      pending = null
      unsubscribe()
    }
  }, [subscribe, filtersKey, debounceMs])
}
