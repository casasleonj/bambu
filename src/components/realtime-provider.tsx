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
  status: 'connecting' | 'open' | 'closed' | 'paused' | 'polling'
  /** True when realtime was disabled via NEXT_PUBLIC_REALTIME_ENABLED=false. */
  disabled: boolean
  subscribe: (filters: string[], callback: (event: RealtimeEvent) => void) => () => void
  /** Register a callback to run each time the SSE connection (re)connects or polling ticks. */
  registerReconnectHandler: (id: string, callback: () => void) => () => void
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

const SSE_URL = '/api/realtime'
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000]
const HEARTBEAT_TIMEOUT_MS = 90_000
const POLL_INTERVAL_MS = 30_000
const MAX_ERRORS_BEFORE_POLLING = 3
const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED !== 'false'

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

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RealtimeContextValue['status']>('closed')
  const subscriptionsRef = useRef<RealtimeSubscription[]>([])
  const reconnectHandlersRef = useRef<Map<string, () => void>>(new Map())
  const eventSourceRef = useRef<EventSource | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const intendedRef = useRef(false)
  const connectRef = useRef<() => void>(() => {})
  const errorCountRef = useRef(0)
  const retryIndexRef = useRef(0)

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
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

  const notifyHandlers = useCallback(() => {
    reconnectHandlersRef.current.forEach((callback) => {
      try {
        callback()
      } catch {
        // Ignore handler errors to avoid breaking the connection.
      }
    })
  }, [])

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return
    if (document.hidden) return
    if (!isOnline()) return

    setStatus('polling')
    // Immediate tick so subscribers refetch right away.
    notifyHandlers()
    pollTimerRef.current = setInterval(() => {
      if (!document.hidden && isOnline()) {
        notifyHandlers()
      }
    }, POLL_INTERVAL_MS)
  }, [notifyHandlers])

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return
    if (!REALTIME_ENABLED) return
    if (eventSourceRef.current) return
    if (document.hidden) return
    if (!isOnline()) {
      startPolling()
      return
    }
    if (shouldAvoidPersistentConnection()) {
      startPolling()
      return
    }

    intendedRef.current = true
    setStatus('connecting')

    const es = new EventSource(SSE_URL)
    eventSourceRef.current = es

    es.addEventListener('connected', () => {
      errorCountRef.current = 0
      retryIndexRef.current = 0
      setStatus('open')
      resetHeartbeat()
      notifyHandlers()
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
      closeConnection()
      setStatus('closed')

      if (!intendedRef.current) return
      if (document.hidden) return

      errorCountRef.current += 1

      if (errorCountRef.current >= MAX_ERRORS_BEFORE_POLLING) {
        startPolling()
        return
      }

      const delay = RETRY_DELAYS_MS[retryIndexRef.current] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
      retryIndexRef.current = Math.min(retryIndexRef.current + 1, RETRY_DELAYS_MS.length - 1)

      setTimeout(
        () => {
          connectRef.current()
        },
        delay,
      )
    })
  }, [closeConnection, resetHeartbeat, notifyHandlers, startPolling])

  // Keep the latest connect() reference available for heartbeat recovery.
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        intendedRef.current = eventSourceRef.current !== null || pollTimerRef.current !== null
        closeConnection()
        clearPolling()
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
      intendedRef.current = eventSourceRef.current !== null || pollTimerRef.current !== null
      closeConnection()
      clearPolling()
      setStatus('closed')
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Only connect on mount if the page is visible and connection is decent.
    let connectTimer: ReturnType<typeof setTimeout> | null = null
    if (!document.hidden && REALTIME_ENABLED) {
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
      clearPolling()
    }
  }, [connect, closeConnection, clearPolling])

  const subscribe = useCallback(
    (filters: string[], callback: (event: RealtimeEvent) => void) => {
      const sub: RealtimeSubscription = { filters, callback }
      subscriptionsRef.current.push(sub)

      // If no connection yet and we're visible, try to connect now that
      // someone is interested.
      if (!eventSourceRef.current && !pollTimerRef.current && !document.hidden && REALTIME_ENABLED) {
        if (shouldAvoidPersistentConnection() || !isOnline()) {
          startPolling()
        } else {
          connect()
        }
      }

      return () => {
        subscriptionsRef.current = subscriptionsRef.current.filter((s) => s !== sub)
        if (subscriptionsRef.current.length === 0) {
          intendedRef.current = false
          closeConnection()
          clearPolling()
          setStatus('closed')
        }
      }
    },
    [connect, closeConnection, clearPolling, startPolling],
  )

  const registerReconnectHandler = useCallback(
    (id: string, callback: () => void) => {
      reconnectHandlersRef.current.set(id, callback)
      return () => {
        reconnectHandlersRef.current.delete(id)
      }
    },
    [],
  )

  return (
    <RealtimeContext.Provider value={{ status, disabled: !REALTIME_ENABLED, subscribe, registerReconnectHandler }}>
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
