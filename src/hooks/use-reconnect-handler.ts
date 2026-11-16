'use client'

import { useContext, useEffect, useId, useRef } from 'react'
import { RealtimeContext } from '@/components/realtime-provider'

/**
 * Register a callback that runs every time the shared SSE connection
 * (re)connects. Useful for refetching data after a Vercel Hobby 60s
 * disconnect or any other reconnect.
 *
 * The callback is kept in a ref so the caller can use fresh closures
 * without re-registering on every render.
 */
export function useReconnectHandler(callback: () => void) {
  const registerReconnectHandler = useContext(RealtimeContext)?.registerReconnectHandler
  const id = useId()
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!registerReconnectHandler) return undefined
    return registerReconnectHandler(id, () => {
      callbackRef.current()
    })
  }, [registerReconnectHandler, id])
}
