'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { RealtimeEvent } from '@/lib/realtime'

interface RealtimeSubscription {
  filters: string[]
  callback: (event: RealtimeEvent) => void
}

interface RealtimeContextValue {
  status: 'connecting' | 'open' | 'closed' | 'paused'
  subscribe: (filters: string[], callback: (event: RealtimeEvent) => void) => () => void
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

const SSE_URL = '/api/realtime'
const INITIAL_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 90_000

function matchesFilter(filter: string, eventType: string): boolean {
  if (filter === eventType) return true
  if (filter.endsWith('.*')) {
    const prefix = filter.slice(0, -2)
    return eventType.startsWith(`${prefix}.`)
  }
  return false
}

function getConnectionType(): string | undefined {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } }
  return nav.connection?.effectiveType
}

function shouldAvoidPersistentConnection(): boolean {
  const type = getConnectionType()
  return type === '2g' || type === 'slow-2g'
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RealtimeContextValue['status']>('closed')
  const subscriptionsRef = useRef<RealtimeSubscription[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY_MS)
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intendedRef = useRef(false)
  const connectRef = useRef<() => void>(() => {})

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  const closeConnection = useCallback(() => {
    clearHeartbeat()
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [clearHeartbeat])

  const resetHeartbeat = useCallback(() => {
    clearHeartbeat()
    heartbeatTimerRef.current = setTimeout(() => {
      // No heartbeat received; close and reconnect.
      closeConnection()
      connectRef.current()
    }, HEARTBEAT_TIMEOUT_MS)
  }, [clearHeartbeat, closeConnection])

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return
    if (eventSourceRef.current) return
    if (document.hidden) return
    if (shouldAvoidPersistentConnection()) return

    intendedRef.current = true
    setStatus('connecting')

    const es = new EventSource(SSE_URL)
    eventSourceRef.current = es

    es.addEventListener('connected', () => {
      retryDelayRef.current = INITIAL_RETRY_DELAY_MS
      setStatus('open')
      resetHeartbeat()
    })

    es.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent
        resetHeartbeat()
        subscriptionsRef.current.forEach((sub) => {
          if (sub.filters.some((filter) => matchesFilter(filter, event.type))) {
            sub.callback(event)
          }
        })
      } catch {
        // Ignore malformed messages.
      }
    })

    es.addEventListener('heartbeat', () => {
      resetHeartbeat()
    })

    es.addEventListener('error', () => {
      // Error event is fired when connection drops or server returns error.
      closeConnection()
      setStatus('closed')

      if (!intendedRef.current) return
      if (document.hidden) return

      // Exponential backoff reconnect.
      setTimeout(
        () => {
          retryDelayRef.current = Math.min(
            retryDelayRef.current * 2,
            MAX_RETRY_DELAY_MS,
          )
          connectRef.current()
        },
        retryDelayRef.current,
      )
    })
  }, [closeConnection, resetHeartbeat])

  // Keep the latest connect() reference available for heartbeat recovery.
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        intendedRef.current = eventSourceRef.current !== null
        closeConnection()
        setStatus('paused')
      } else if (intendedRef.current) {
        connect()
      }
    }

    const handleOnline = () => {
      if (intendedRef.current && !document.hidden) {
        connect()
      }
    }

    const handleOffline = () => {
      intendedRef.current = eventSourceRef.current !== null
      closeConnection()
      setStatus('closed')
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Only connect on mount if the page is visible and connection is decent.
    // Defer so this effect body does not synchronously call setState.
    let connectTimer: ReturnType<typeof setTimeout> | null = null
    if (!document.hidden && !shouldAvoidPersistentConnection()) {
      connectTimer = setTimeout(connect, 0)
    }

    return () => {
      if (connectTimer) {
        clearTimeout(connectTimer)
      }
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      intendedRef.current = false
      closeConnection()
    }
  }, [connect, closeConnection])

  const subscribe = useCallback(
    (filters: string[], callback: (event: RealtimeEvent) => void) => {
      const sub: RealtimeSubscription = { filters, callback }
      subscriptionsRef.current.push(sub)

      // If no connection yet and we're visible, try to connect now that
      // someone is interested.
      if (!eventSourceRef.current && !document.hidden && !shouldAvoidPersistentConnection()) {
        connect()
      }

      return () => {
        subscriptionsRef.current = subscriptionsRef.current.filter((s) => s !== sub)
        if (subscriptionsRef.current.length === 0) {
          intendedRef.current = false
          closeConnection()
          setStatus('closed')
        }
      }
    },
    [connect, closeConnection],
  )

  return (
    <RealtimeContext.Provider value={{ status, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) {
    throw new Error('useRealtime must be used within a RealtimeProvider')
  }
  return ctx
}
