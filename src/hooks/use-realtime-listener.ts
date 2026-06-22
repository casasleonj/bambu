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
  const ctx = useContext(RealtimeContext)
  const callbackRef = useRef(callback)
  const filtersKey = filters.join(',')

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const debounceMs = options.debounceMs ?? 500
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<RealtimeEvent | null>(null)

  useEffect(() => {
    if (!ctx) return undefined
    if (filters.length === 0) return undefined

    return ctx.subscribe(filters, (event) => {
      pendingRef.current = event
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        if (pendingRef.current) {
          callbackRef.current(pendingRef.current)
          pendingRef.current = null
        }
      }, debounceMs)
    })
  }, [ctx, filters, filtersKey, debounceMs])
}
