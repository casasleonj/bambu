import { useState, useEffect, useCallback, useRef } from 'react'

export interface UsePedidosCountsResult {
  fiadosCount: number
  alertasCount: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function usePedidosCounts(autoFetch = true): UsePedidosCountsResult {
  const [fiadosCount, setFiadosCount] = useState(0)
  const [alertasCount, setAlertasCount] = useState(0)
  const [loading, setLoading] = useState(autoFetch)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const fetchCounts = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestIdRef.current === requestId

    if (!isCurrent()) return

    setLoading(true)
    setError(null)

    const timeoutId = setTimeout(() => controller.abort(), 30_000)

    try {
      const res = await fetch('/api/pedidos/counts', {
        credentials: 'include',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!isCurrent()) return
      const data = await res.json()
      if (!isCurrent()) return
      if (data.success) {
        setFiadosCount(data.data?.fiadosCount ?? data.fiadosCount ?? 0)
        setAlertasCount(data.data?.alertasCount ?? data.alertasCount ?? 0)
        setError(null)
      } else {
        setError(data.error?.message || 'Error cargando contadores')
      }
    } catch (err) {
      clearTimeout(timeoutId)
      if (!isCurrent()) return
      if (err instanceof Error && err.name === 'AbortError') {
        setError('La carga está tardando demasiado. Reintenta.')
        return
      }
      setError('No se pudieron cargar los contadores')
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoFetch) fetchCounts()
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [autoFetch, fetchCounts])

  return { fiadosCount, alertasCount, loading, error, refetch: fetchCounts }
}
