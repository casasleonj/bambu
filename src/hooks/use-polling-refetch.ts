'use client'

import { useEffect, useRef } from 'react'

/**
 * Hook that periodically calls a callback at a fixed interval.
 *
 * Auto-pauses when:
 * - The document is hidden (tab in background).
 * - The browser is offline.
 *
 * The callback is stored in a ref to avoid restarting the interval on
 * every render. The interval is set up once on mount and cleared on unmount.
 *
 * @param callback - Function to call on each tick.
 * @param intervalMs - Interval in milliseconds. Default: 60000 (60s).
 *
 * @example
 * ```tsx
 * usePollingRefetch(fetchClientes, 60_000)
 * ```
 */
export function usePollingRefetch(
  callback: () => void | Promise<void>,
  intervalMs = 60_000,
): void {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const isOnline = () =>
      typeof navigator === 'undefined' ? true : navigator.onLine

    const tick = () => {
      if (cancelled) return
      if (document.hidden) return
      if (!isOnline()) return
      try {
        void callbackRef.current()
      } catch {
        // Swallow errors: polling should never break the host component.
      }
    }

    // First tick after a short delay so the page settles.
    const initial = setTimeout(tick, 2_000)
    timer = setInterval(tick, intervalMs)

    const onVisibility = () => {
      if (!document.hidden) {
        // Trigger an immediate refetch when the tab becomes visible again.
        tick()
      }
    }
    const onOnline = () => {
      // Trigger an immediate refetch when coming back online.
      tick()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      clearTimeout(initial)
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [intervalMs])
}
