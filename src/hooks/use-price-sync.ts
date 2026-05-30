'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const POLL_INTERVAL = 15000 // 15 segundos
const MAX_BACKOFF = 60000 // 60 segundos máximo

interface UsePriceSyncReturn {
  stale: boolean
  refresh: () => Promise<void>
  version: string | null
}

/**
 * Hook para detectar cambios de precios via polling.
 * 
 * - Consulta /api/precios/version cada 15s
 * - Compara con versión anterior
 * - Si cambió, marca stale = true
 * - Pausa polling cuando la pestaña no está visible
 * - Backoff exponencial en errores de red (15s → 30s → 60s)
 * 
 * @param onRefresh - Callback opcional que se ejecuta cuando se detecta un cambio
 */
export function usePriceSync(onRefresh?: () => void): UsePriceSyncReturn {
  const [stale, setStale] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const lastVersionRef = useRef<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const backoffRef = useRef(POLL_INTERVAL)
  const isPausedRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  const checkVersionRef = useRef<(() => Promise<void>) | null>(null)

  // Actualizar ref de callback sin causar re-render
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  // Definir la función checkVersion dentro de un efecto para evitar asignar refs durante render
  useEffect(() => {
    checkVersionRef.current = async () => {
      if (isPausedRef.current) return

      try {
        const res = await fetch('/api/precios/version')
        if (!res.ok) throw new Error('Failed to fetch version')

        const data = await res.json()
        const currentVersion = data.version as string

        // Reset backoff on success
        backoffRef.current = POLL_INTERVAL

        if (lastVersionRef.current === null) {
          lastVersionRef.current = currentVersion
          setVersion(currentVersion)
        } else if (lastVersionRef.current !== currentVersion) {
          lastVersionRef.current = currentVersion
          setVersion(currentVersion)
          setStale(true)
          onRefreshRef.current?.()
        }
      } catch (error) {
        console.error('Price sync error:', error)
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)

        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = setInterval(() => {
            checkVersionRef.current?.()
          }, backoffRef.current)
        }
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    setStale(false)
    await checkVersionRef.current?.()
  }, [])

  useEffect(() => {
    // Consulta inicial
    checkVersionRef.current?.()

    // Configurar polling
    intervalRef.current = setInterval(() => {
      checkVersionRef.current?.()
    }, POLL_INTERVAL)

    // Pausar cuando la pestaña no está visible (Page Visibility API)
    const handleVisibilityChange = () => {
      isPausedRef.current = document.hidden
      if (!document.hidden) {
        checkVersionRef.current?.()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return { stale, refresh, version }
}
