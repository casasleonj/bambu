'use client'

import { useEffect, useState } from 'react'

/**
 * Stock disponible del día para armar la carga de un embarque.
 *
 * Extraído de `embarque-form-modal.tsx` (Fase 1 del rediseño de "Nuevo Embarque")
 * para que el wizard nuevo y el modal de edición compartan la misma lógica sin
 * duplicarla. El fetch vive acá; la evaluación de una carga concreta contra el
 * stock es la función pura `evaluarStockCarga`, testeable aislada.
 *
 * Fuente: `GET /api/embarques?all=true&stock=true` → `{ stock, tieneStockEstimado }`.
 * Límite duro de unidades: `GET /api/config?keys=MAX_UNIDADES_EMBARQUE`.
 * El frontend NUNCA hardcodea el 70 como regla — solo lo usa de fallback
 * mientras el config carga.
 */

export interface StockDisponible {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
}

export type StockNivel = 'sin-stock' | 'ideal' | 'suficiente' | 'ajustado' | 'insuficiente'

export interface StockStatus {
  nivel: StockNivel
  label: string
  color: string
}

export interface EvaluacionStock {
  /** Algún producto de la carga supera su stock disponible. */
  hayStockInsuficiente: boolean
  /** Semáforo global (null si aún no hay stock cargado). */
  status: StockStatus | null
  /** Claves de producto cuya carga supera el stock (y el stock es > 0). */
  productosConDeficit: string[]
  /** El déficit de algún producto supera 10 unidades → exige motivo. */
  requiereMotivo: boolean
}

const MAX_UNIDADES_FALLBACK = 70

/**
 * Evalúa una carga concreta contra el stock disponible. Pura, sin red.
 */
export function evaluarStockCarga(
  stock: StockDisponible | null,
  carga: Record<string, number>,
): EvaluacionStock {
  if (!stock) {
    return { hayStockInsuficiente: false, status: null, productosConDeficit: [], requiereMotivo: false }
  }
  const sd = stock as unknown as Record<string, number>

  const productosConDeficit = Object.keys(sd).filter((key) => {
    const val = carga[key] || 0
    const max = sd[key] || 0
    return val > max && max > 0
  })

  const requiereMotivo = productosConDeficit.some((key) => {
    const val = carga[key] || 0
    const max = sd[key] || 0
    return val - max > 10
  })

  const hayStockInsuficiente = Object.entries(carga).some(([key, val]) => val > (sd[key] || 0))

  // Semáforo: usa el subtotal de los 3 productos "grandes" (pacas + botellón),
  // mismo criterio que tenía el form viejo.
  const totalDisponible = (sd.PACA_AGUA || 0) + (sd.PACA_HIELO || 0) + (sd.BOTELLON || 0)
  const totalCargado = (carga.PACA_AGUA || 0) + (carga.PACA_HIELO || 0) + (carga.BOTELLON || 0)

  let status: StockStatus | null
  if (totalDisponible === 0) {
    status = { nivel: 'sin-stock', label: 'Sin stock registrado', color: 'text-gray-500' }
  } else if (totalCargado === 0) {
    status = { nivel: 'ideal', label: 'Sin carga', color: 'text-gray-500' }
  } else {
    const pct = (totalCargado / totalDisponible) * 100
    if (pct <= 80) status = { nivel: 'suficiente', label: 'Stock suficiente', color: 'text-green-600' }
    else if (pct <= 100) status = { nivel: 'ajustado', label: 'Stock ajustado', color: 'text-yellow-600' }
    else status = { nivel: 'insuficiente', label: 'Stock insuficiente', color: 'text-red-600' }
  }

  return { hayStockInsuficiente, status, productosConDeficit, requiereMotivo }
}

export interface UseStockDisponible {
  stockDisponible: StockDisponible | null
  tieneStockEstimado: boolean
  maxUnidades: number
}

/**
 * Carga stock disponible + límite de unidades cuando `active` pasa a true
 * (típicamente al abrir el modal). Se recarga cada vez que `active` transiciona
 * de false a true. Mientras `stockDisponible` es null, el consumidor está cargando.
 */
export function useStockDisponible(active: boolean): UseStockDisponible {
  const [stockDisponible, setStockDisponible] = useState<StockDisponible | null>(null)
  const [tieneStockEstimado, setTieneStockEstimado] = useState(false)
  const [maxUnidades, setMaxUnidades] = useState(MAX_UNIDADES_FALLBACK)

  useEffect(() => {
    if (!active) return
    let cancelled = false

    fetch('/api/embarques?all=true&stock=true', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.stock) setStockDisponible(data.stock as StockDisponible)
        if (typeof data?.tieneStockEstimado === 'boolean') setTieneStockEstimado(data.tieneStockEstimado)
      })
      .catch(() => {})

    fetch('/api/config?keys=MAX_UNIDADES_EMBARQUE', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const n = Number(data?.MAX_UNIDADES_EMBARQUE)
        if (Number.isInteger(n) && n > 0) setMaxUnidades(n)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [active])

  return { stockDisponible, tieneStockEstimado, maxUnidades }
}
