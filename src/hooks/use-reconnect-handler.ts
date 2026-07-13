import { useEffect, useRef } from 'react'

/**
 * Calls the provided callback when the browser detects it is back online.
 * Useful for refreshing data after a network interruption or when an SSE
 * connection cycles (e.g. Vercel Hobby 60s timeout).
 *
 * The callback is debounced so rapid `online` events do not fire multiple
 * refetches in succession.
 */
export function useReconnectHandler(callback: () => void, debounceMs = 1000) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const handleOnline = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current()
      }, debounceMs)
    }

    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [debounceMs])
}
