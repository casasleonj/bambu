'use client'

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PRICES } from '@/lib/prices'
import type { Tier } from '@/components/pedido-form-unified/types'

export interface ProductoConfig {
  codigo: string
  aplicaDomicilio: boolean
  sobreCostoDomicilio: number
}

export interface ItemPricingData {
  /** tiers de volumen por código canónico. */
  tabla: Record<string, Tier[]>
  configs: ProductoConfig[]
  loading: boolean
  /**
   * Precio de tabla/base (sin precio manual) para un producto y canal —
   * misma regla que `getPrecioBase` de pedido-form-unified: primer tier +
   * recargo de domicilio si aplica. Solo para MOSTRAR la referencia tachada
   * y el placeholder del input de precio manual en `PedidoItemEditor`.
   * El precio efectivo y el total autoritativos vienen del preview del backend.
   */
  precioBaseFor: (codigo: string, canal: 'PUNTO' | 'DOMICILIO') => number
}

/**
 * Carga de datos de pricing NO autoritativos para la UI del `PedidoItemEditor`
 * (tiers de volumen, precio base tachado). `/api/precios/tabla` y
 * `/api/productos/configs` son estáticos (cambian rara vez) → un fetch al montar.
 * El cálculo autoritativo (precio efectivo, total) viene de `usePreview`.
 */
export function useItemPricing(): ItemPricingData {
  const [tabla, setTabla] = useState<Record<string, Tier[]>>({})
  const [configs, setConfigs] = useState<ProductoConfig[]>([])
  const [loading, setLoading] = useState(true)
  const doneRef = useRef(false)

  useEffect(() => {
    if (doneRef.current) return
    doneRef.current = true
    let alive = true
    Promise.all([
      fetch('/api/precios/tabla').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/productos/configs').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([tablaRes, configsRes]) => {
      if (!alive) return
      if (tablaRes?.tabla) setTabla(tablaRes.tabla)
      if (configsRes?.success && configsRes.productos) setConfigs(configsRes.productos)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const precioBaseFor = (codigo: string, canal: 'PUNTO' | 'DOMICILIO'): number => {
    const tiers = tabla[codigo]
    let precio = tiers && tiers.length > 0 ? tiers[0].precio : (DEFAULT_PRICES[codigo] || 0)
    if (canal === 'DOMICILIO') {
      const cfg = configs.find((c) => c.codigo === codigo)
      if (cfg?.aplicaDomicilio) precio += Number(cfg.sobreCostoDomicilio)
    }
    return precio
  }

  return { tabla, configs, loading, precioBaseFor }
}
