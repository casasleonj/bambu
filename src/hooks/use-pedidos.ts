/**
 * usePedidos Hook.
 *
 * Fetches pedidos with filtering, pagination, and caching.
 * Replaces direct fetch('/api/pedidos') calls in components.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'

export interface PedidoFilterParams {
  desde?: string
  hasta?: string
  tipo?: string[]
  origen?: string[]
  estadoEntrega?: string[]
  estadoPago?: string[]
  search?: string
  clienteId?: string
  /** Server-side tab scope: isolates Pedidos/Fiados/Alertas datasets. */
  scope?: 'fiados' | 'alertas'
}

export interface UsePedidosOptions {
  all?: boolean
  autoFetch?: boolean
}

export interface UsePedidosResult {
  pedidos: unknown[]
  loading: boolean
  error: string | null
  total: number
  fetchPedidos: () => Promise<void>
  refetch: () => Promise<void>
  hasLoadedOnce: boolean
}

export function usePedidos(
  params?: PedidoFilterParams,
  options?: UsePedidosOptions,
): UsePedidosResult {
  const [pedidos, setPedidos] = useState<unknown[]>([])
  const [loading, setLoading] = useState(options?.autoFetch !== false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const didInitialFetchRef = useRef(false)
  const lastParamsKeyRef = useRef<string>('')
  const requestIdRef = useRef(0)

  const paramsKey = useMemo(() => JSON.stringify({
    ...params,
    all: options?.all,
  }), [params, options?.all])

  const buildUrl = useCallback(() => {
    const url = new URL('/api/pedidos', window.location.origin)
    if (options?.all) {
      url.searchParams.set('all', 'true')
    }
    if (params?.desde) url.searchParams.set('desde', params.desde)
    if (params?.hasta) url.searchParams.set('hasta', params.hasta)
    if (params?.clienteId) url.searchParams.set('clienteId', params.clienteId)
    if (params?.tipo) params.tipo.forEach(t => url.searchParams.append('tipo', t))
    if (params?.origen) params.origen.forEach(o => url.searchParams.append('origen', o))
    if (params?.estadoEntrega) params.estadoEntrega.forEach(e => url.searchParams.append('estadoEntrega', e))
    if (params?.estadoPago) params.estadoPago.forEach(e => url.searchParams.append('estadoPago', e))
    if (params?.search) url.searchParams.set('search', params.search)
    if (params?.scope) url.searchParams.set('scope', params.scope)
    return url.toString()
  }, [params, options?.all])

  const fetchPedidos = useCallback(async () => {
    // Cancel previous request and mark this generation as current.
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestIdRef.current === requestId

    // If a newer request already started while we were setting up, bail out.
    if (!isCurrent()) return

    setLoading(true)
    setError(null)

    // Mobile networks (2g/3g) can leave fetch requests hanging indefinitely.
    // Vercel Hobby cold-start + proxy rate-limit + DB queries pueden tardar
    // >10s legítimamente incluso en desktop. 30s cubre cold-start severo
    // (~25s) sin ser tan largo como para frustrar al usuario. El caller
    // puede mostrar un retry UI si expira.
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 30_000)

    try {
      const url = buildUrl()
      const res = await fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!isCurrent()) return
      const data = await res.json()
      if (!isCurrent()) return
      if (data.success) {
        setPedidos(data.pedidos || data.data || [])
        setTotal(data.total || 0)
        setHasLoadedOnce(true)
        setError(null)
      } else {
        setError(data.error?.message || 'Error cargando pedidos')
      }
    } catch (err) {
      clearTimeout(timeoutId)
      if (!isCurrent()) return
      if (err instanceof Error && err.name === 'AbortError') {
        // Fetch was aborted by the timeout above or by a newer request/filter change.
        // Surface a retry-friendly message without generic error noise.
        setError('La carga está tardando demasiado. Reintenta.')
        return
      }
      console.error('Error fetching pedidos:', err)
      setError('No se pudieron cargar los pedidos')
      toast.error('Error cargando pedidos')
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [buildUrl])

  const refetch = useCallback(async () => {
    await fetchPedidos()
  }, [fetchPedidos])

  // Fetch inicial controlado por autoFetch, y refetch automático cuando
  // cambian los filtros (params). Comparamos por serialización para evitar
  // loops infinitos cuando params cambia de referencia pero no de valor.
  useEffect(() => {
    const isFirstRun = !didInitialFetchRef.current
    const paramsChanged = paramsKey !== lastParamsKeyRef.current

    if (isFirstRun) {
      didInitialFetchRef.current = true
      lastParamsKeyRef.current = paramsKey
      if (options?.autoFetch !== false) {
        fetchPedidos()
      }
      return
    }

    if (paramsChanged) {
      lastParamsKeyRef.current = paramsKey
      fetchPedidos()
    }
  }, [paramsKey, options?.all, options?.autoFetch, fetchPedidos])

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return { pedidos, loading, error, total, fetchPedidos, refetch, hasLoadedOnce }
}
