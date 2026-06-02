/**
 * useResolverPrecios Hook.
 *
 * Handles price resolution for pedido items via API.
 * Encapsulates fetching price table, product configs, and resolving prices.
 * Offline-first: la resolución de precios encola en sync si la red falla.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { DEFAULT_PRICES, PRODUCTO_INFO, getProductosForCanal, type ProductoId } from '@/lib/prices'
import type { Tier } from '@/components/pedido-form/types'
import { usePriceSync } from '@/hooks/use-price-sync'
import { fetchResilient } from '@/lib/fetch-resilient'

export interface UseResolverPreciosOptions {
  canal: 'PUNTO' | 'DOMICILIO'
  preciosBase?: Record<string, number>
}

export function useResolverPrecios(options: UseResolverPreciosOptions) {
  const { canal, preciosBase = {} } = options

  const [tablaPrecios, setTablaPrecios] = useState<Record<string, Tier[]>>({})
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, number>>({})
  const [productosConfig, setProductosConfig] = useState<Array<{ codigo: string; aplicaDomicilio: boolean }>>([])
  const productosRef = useRef<Record<ProductoId, number>>({})
  const clienteIdRef = useRef<string | undefined>(undefined)

  // Fetch price table on mount
  useEffect(() => {
    fetch('/api/precios/tabla')
      .then(r => r.json())
      .then(d => { if (d.tabla) setTablaPrecios(d.tabla) })
      .catch(() => {})
  }, [])

  // Fetch product configs on mount
  useEffect(() => {
    fetch('/api/productos/configs')
      .then(r => r.json())
      .then(d => { if (d.success && d.productos) setProductosConfig(d.productos) })
      .catch(() => {})
  }, [])

  const productosVisibles = getProductosForCanal(canal, productosConfig)

  const resolverPrecios = useCallback(async (
    prods: Record<ProductoId, number>,
    clienteId?: string,
  ) => {
    const items = productosVisibles
      .filter(id => prods[id] > 0)
      .map(id => ({
        codigo: PRODUCTO_INFO[id].codigo,
        cantidad: prods[id],
      }))

    if (items.length === 0) {
      setPreciosResueltos({})
      return
    }

    try {
      const result = await fetchResilient<{ precios?: Record<string, { precio: number }> }>(
        '/api/precios/resolver',
        { method: 'POST', body: { items, canal, clienteId }, localEndpoint: 'resolver-precios' }
      )
      if (result.status === 'ok' && result.data.precios) {
        const nuevos: Record<string, number> = {}
        for (const [codigo, info] of Object.entries(result.data.precios)) {
          nuevos[codigo] = info.precio
        }
        setPreciosResueltos(nuevos)
      }
      // status === 'offline' o 'error' → fallback a precios cacheados (silently)
    } catch {
      // fallback
    }
  }, [productosVisibles, canal])

  // Price sync: detect price changes via polling
  const handlePriceRefresh = useCallback(async () => {
    try {
      const res = await fetch('/api/precios/tabla')
      const data = await res.json()
      if (data.tabla) {
        setTablaPrecios(data.tabla)
        // Re-resolve prices if there are quantities loaded
        if (Object.values(productosRef.current).some(c => c > 0)) {
          resolverPrecios(productosRef.current, clienteIdRef.current)
        }
      }
    } catch (error) {
      console.error('Error refreshing prices:', error)
    }
  }, [resolverPrecios])

  const { stale: preciosStale, refresh: refreshPrecios } = usePriceSync(handlePriceRefresh)

  // Update refs
  const updateRefs = useCallback((prods: Record<ProductoId, number>, clienteId?: string) => {
    productosRef.current = prods
    clienteIdRef.current = clienteId
  }, [])

  const getPrecio = useCallback((productoId: ProductoId): number => {
    const info = PRODUCTO_INFO[productoId]
    if (preciosResueltos[info.codigo] && preciosResueltos[info.codigo] > 0) {
      return preciosResueltos[info.codigo]
    }
    const tiers = tablaPrecios[info.codigo]
    if (tiers && tiers.length > 0) {
      return tiers[0].precio
    }
    return preciosBase[info.codigo] || DEFAULT_PRICES[info.codigo] || 0
  }, [preciosResueltos, tablaPrecios, preciosBase])

  const getEffectivePrice = useCallback((codigo: string, preciosManuales: Record<string, number>): number => {
    if (preciosManuales[codigo] !== undefined) return preciosManuales[codigo]
    if (preciosResueltos[codigo]) return preciosResueltos[codigo]
    const pid = productosVisibles.find(id => PRODUCTO_INFO[id].codigo === codigo)
    return pid ? getPrecio(pid) : 0
  }, [preciosResueltos, productosVisibles, getPrecio])

  const calcularTotal = useCallback((productos: Record<ProductoId, number>, preciosManuales: Record<string, number>): number => {
    return productosVisibles.reduce((total, prodId) => {
      const cant = productos[prodId] || 0
      if (cant <= 0) return total
      const info = PRODUCTO_INFO[prodId]
      return total + cant * getEffectivePrice(info.codigo, preciosManuales)
    }, 0)
  }, [productosVisibles, getEffectivePrice])

  const formatTier = (t: Tier): string => {
    if (t.cantMax) return `${t.cantMin}-${t.cantMax}: $${t.precio.toLocaleString()}`
    return `${t.cantMin}+: $${t.precio.toLocaleString()}`
  }

  const getActiveTier = (codigo: string, cant: number): Tier | undefined => {
    const tiers = tablaPrecios[codigo]
    if (!tiers) return undefined
    return tiers.find(t => cant >= t.cantMin && (t.cantMax === null || cant <= t.cantMax))
  }

  return {
    tablaPrecios,
    preciosResueltos,
    productosConfig,
    productosVisibles,
    preciosStale,
    resolverPrecios,
    refreshPrecios,
    updateRefs,
    getPrecio,
    getEffectivePrice,
    calcularTotal,
    formatTier,
    getActiveTier,
  }
}
