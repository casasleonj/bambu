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
const SSE_CONNECTION_TIMEOUT_MS = 8_000
const RATE_LIMITED_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMITED_COOLDOWN_MS = 5 * 60 * 1000
const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED !== 'false'

function jitteredDelay(baseMs: number): number {
  return Math.floor(baseMs * (1 + Math.random() * 0.3))
}

function matchesFilter(filter: string, eventType: string): boolean {
  if (filter === eventType) return true
  if (filter.endsWith('.*')) {
    const prefix = filter.slice(0, -2)
    return eventType.startsWith(`${prefix}.`)
  }
  return false
}

interface NetworkConnection {
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
}

function getConnection(): NetworkConnection | undefined {
  const nav = navigator as Navigator & { connection?: NetworkConnection }
  return nav.connection
}

function shouldAvoidPersistentConnection(): boolean {
  const conn = getConnection()
  const type = conn?.effectiveType
  // Use estimated downlink when available: slow 3g links (<1.5 Mbps) or
  // officially slow types should not hold a long-lived SSE connection.
  const slowDownlink = typeof conn?.downlink === 'number' && conn.downlink < 1.5
  // Data saver mode (common on prepaid mobile plans) disables long-lived connections
  // because they keep the radio active and consume the data quota.
  return type === '2g' || type === 'slow-2g' || slowDownlink || conn?.saveData === true
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
  const sseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intendedRef = useRef(false)
  const connectRef = useRef<() => void>(() => {})
  const errorCountRef = useRef(0)
  const retryIndexRef = useRef(0)
  const connectingRef = useRef(false)
  const rateLimitedUntilRef = useRef(0)
  const consecutiveRateLimitsRef = useRef(0)
  const lastRateLimitedAtRef = useRef(0)
  const disableRealtimeUntilRef = useRef(0)
  const lastErrorAtRef = useRef(0)

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  const clearSseTimeout = useCallback(() => {
    if (sseTimeoutRef.current) {
      clearTimeout(sseTimeoutRef.current)
      sseTimeoutRef.current = null
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
    clearSseTimeout()
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [clearHeartbeat, clearSseTimeout])

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
    if (connectingRef.current || eventSourceRef.current) return
    if (document.hidden) return

    // Rate-limit circuit breaker: server told us to back off.
    const now = Date.now()
    if (now < rateLimitedUntilRef.current || now < disableRealtimeUntilRef.current) {
      if (isOnline()) startPolling()
      return
    }
    if (!isOnline()) {
      startPolling()
      return
    }
    if (shouldAvoidPersistentConnection()) {
      startPolling()
      return
    }

    intendedRef.current = true
    connectingRef.current = true
    setStatus('connecting')

    const es = new EventSource(SSE_URL)
    eventSourceRef.current = es

    const finishConnecting = () => {
      connectingRef.current = false
    }

    // Guard against SSE connections that never establish (e.g. Vercel 504).
    // If we don't receive any event quickly, treat it as an error so we fall
    // back to polling without waiting for the browser timeout.
    sseTimeoutRef.current = setTimeout(() => {
      closeConnection()
      finishConnecting()
      setStatus('closed')
      // Mark the error timestamp so the browser's 'error' event (fired as a
      // consequence of closeConnection) is deduped and does not double-count.
      lastErrorAtRef.current = Date.now()
      errorCountRef.current += 1
      if (errorCountRef.current >= MAX_ERRORS_BEFORE_POLLING) {
        startPolling()
      } else {
        const baseDelay = RETRY_DELAYS_MS[retryIndexRef.current] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
        retryIndexRef.current = Math.min(retryIndexRef.current + 1, RETRY_DELAYS_MS.length - 1)
        setTimeout(() => connectRef.current(), jitteredDelay(baseDelay))
      }
    }, SSE_CONNECTION_TIMEOUT_MS)

    es.addEventListener('connected', () => {
      clearSseTimeout()
      finishConnecting()
      errorCountRef.current = 0
      retryIndexRef.current = 0
      consecutiveRateLimitsRef.current = 0
      lastRateLimitedAtRef.current = 0
      disableRealtimeUntilRef.current = 0
      rateLimitedUntilRef.current = 0
      setStatus('open')
      resetHeartbeat()
      notifyHandlers()
    })

    es.addEventListener('message', (e) => {
      clearSseTimeout()
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
      clearSseTimeout()
      resetHeartbeat()
    })

    es.addEventListener('rate_limited', (e) => {
      closeConnection()
      finishConnecting()
      setStatus('closed')

      let retryAfter = 60
      try {
        const payload = JSON.parse((e as MessageEvent).data)
        if (typeof payload?.retryAfter === 'number') retryAfter = payload.retryAfter
      } catch {
        // Use default retryAfter.
      }

      const now = Date.now()
      rateLimitedUntilRef.current = now + retryAfter * 1000

      // Circuit breaker: 3 consecutive rate-limited events within the window
      // disable SSE for a longer cooldown to stop the request storm.
      if (now - lastRateLimitedAtRef.current < RATE_LIMITED_WINDOW_MS) {
        consecutiveRateLimitsRef.current += 1
      } else {
        consecutiveRateLimitsRef.current = 1
      }
      lastRateLimitedAtRef.current = now
      if (consecutiveRateLimitsRef.current >= 3) {
        disableRealtimeUntilRef.current = now + RATE_LIMITED_COOLDOWN_MS
      }

      // Reset error counters so the general retry ladder doesn't double-count.
      errorCountRef.current = 0
      retryIndexRef.current = 0

      if (isOnline()) startPolling()

      // Schedule an SSE reconnect once the server's backoff window expires.
      setTimeout(() => connectRef.current(), retryAfter * 1000)
    })

    es.addEventListener('error', () => {
      closeConnection()
      finishConnecting()
      setStatus('closed')

      if (!intendedRef.current) return
      if (document.hidden) return

      // Dedup: some browsers fire multiple error events for the same failure.
      const now = Date.now()
      if (now - lastErrorAtRef.current < 1000) return
      lastErrorAtRef.current = now

      errorCountRef.current += 1

      if (errorCountRef.current >= MAX_ERRORS_BEFORE_POLLING) {
        startPolling()
        return
      }

      const baseDelay = RETRY_DELAYS_MS[retryIndexRef.current] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
      retryIndexRef.current = Math.min(retryIndexRef.current + 1, RETRY_DELAYS_MS.length - 1)

      setTimeout(() => connectRef.current(), jitteredDelay(baseDelay))
    })
  }, [closeConnection, clearSseTimeout, resetHeartbeat, notifyHandlers, startPolling])

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
