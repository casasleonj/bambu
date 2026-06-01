/**
 * usePedidos Hook.
 *
 * Fetches pedidos with filtering, pagination, and caching.
 * Replaces direct fetch('/api/pedidos') calls in components.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

export interface PedidoFilterParams {
  desde?: string
  hasta?: string
  cliente?: string
  tipo?: string[]
  origen?: string[]
  estadoEntrega?: string[]
  estadoPago?: string[]
  search?: string
  clienteId?: string
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
}

export function usePedidos(
  params?: PedidoFilterParams,
  options?: UsePedidosOptions,
): UsePedidosResult {
  const [pedidos, setPedidos] = useState<unknown[]>([])
  const [loading, setLoading] = useState(options?.autoFetch !== false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const buildUrl = useCallback(() => {
    const url = new URL('/api/pedidos', window.location.origin)
    if (options?.all) {
      url.searchParams.set('all', 'true')
    }
    if (params?.desde) url.searchParams.set('desde', params.desde)
    if (params?.hasta) url.searchParams.set('hasta', params.hasta)
    if (params?.cliente) url.searchParams.set('cliente', params.cliente)
    if (params?.clienteId) url.searchParams.set('clienteId', params.clienteId)
    if (params?.tipo) params.tipo.forEach(t => url.searchParams.append('tipo', t))
    if (params?.origen) params.origen.forEach(o => url.searchParams.append('origen', o))
    if (params?.estadoEntrega) params.estadoEntrega.forEach(e => url.searchParams.append('estadoEntrega', e))
    if (params?.estadoPago) params.estadoPago.forEach(e => url.searchParams.append('estadoPago', e))
    if (params?.search) url.searchParams.set('search', params.search)
    return url.toString()
  }, [params, options?.all])

  const fetchPedidos = useCallback(async () => {
    // Cancel previous request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const url = buildUrl()
      const res = await fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      })
      const data = await res.json()
      if (data.success) {
        setPedidos(data.pedidos || data.data || [])
        setTotal(data.total || 0)
      } else {
        setError(data.error?.message || 'Error cargando pedidos')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('Error fetching pedidos:', err)
      setError('No se pudieron cargar los pedidos')
      toast.error('Error cargando pedidos')
    } finally {
      setLoading(false)
    }
  }, [buildUrl])

  const refetch = useCallback(async () => {
    await fetchPedidos()
  }, [fetchPedidos])

  useEffect(() => {
    if (options?.autoFetch !== false) {
      fetchPedidos()
    }
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [fetchPedidos, options?.autoFetch])

  return { pedidos, loading, error, total, fetchPedidos, refetch }
}
