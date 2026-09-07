'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPeek, peekCached, type PeekLayer2 } from './peek-cache'
import type { Pedido } from './types'

export interface UsePeekResult {
  /** id de la operación abierta en el peek, o null. */
  activeId: string | null
  /** capa 1 — el pedido de la lista, disponible al instante (0 fetch). */
  layer1: Pedido | null
  /** capa 2 — datos enriquecidos del endpoint; undefined mientras carga. */
  layer2: PeekLayer2 | null
  loadingLayer2: boolean
  errorLayer2: boolean
  open: (pedido: Pedido) => void
  close: () => void
  /** navega por la lista (↑/↓) manteniendo el peek abierto. */
  nav: (dir: 'prev' | 'next') => void
}

/**
 * Estado del peek contextual del Pedido Hub (blueprint §3.4 / §4.3).
 * Capa 1 instantánea (de la lista), capa 2 con caché + descarte de respuestas
 * stale cuando el usuario recorre rápido con ↑/↓.
 */
export function usePeek(pedidos: Pedido[]): UsePeekResult {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [layer2, setLayer2] = useState<PeekLayer2 | null>(null)
  const [loadingLayer2, setLoadingLayer2] = useState(false)
  const [errorLayer2, setErrorLayer2] = useState(false)
  const reqRef = useRef(0)

  const layer1 = activeId ? pedidos.find((p) => p.id === activeId) ?? null : null

  const fetchLayer2 = useCallback((id: string) => {
    const cached = peekCached(id)
    if (cached) {
      setLayer2(cached)
      setLoadingLayer2(false)
      setErrorLayer2(false)
      return
    }
    const req = ++reqRef.current
    setLayer2(null)
    setLoadingLayer2(true)
    setErrorLayer2(false)
    loadPeek(id).then((data) => {
      if (req !== reqRef.current) return // stale: el usuario ya navegó a otra operación
      setLoadingLayer2(false)
      if (data) setLayer2(data)
      else setErrorLayer2(true)
    })
  }, [])

  const open = useCallback((pedido: Pedido) => {
    setActiveId(pedido.id)
    fetchLayer2(pedido.id)
  }, [fetchLayer2])

  const close = useCallback(() => {
    reqRef.current++ // cancela cualquier aplicación de resultado pendiente
    setActiveId(null)
    setLayer2(null)
    setLoadingLayer2(false)
    setErrorLayer2(false)
  }, [])

  const nav = useCallback((dir: 'prev' | 'next') => {
    setActiveId((cur) => {
      if (!cur) return cur
      const idx = pedidos.findIndex((p) => p.id === cur)
      if (idx === -1) return cur
      const next = dir === 'next' ? idx + 1 : idx - 1
      if (next < 0 || next >= pedidos.length) return cur
      const target = pedidos[next]
      fetchLayer2(target.id)
      return target.id
    })
  }, [pedidos, fetchLayer2])

  // Si el peek está abierto y su operación desaparece de la lista (filtro
  // cambió, se anuló), cerrar.
  useEffect(() => {
    if (activeId && !pedidos.some((p) => p.id === activeId)) close()
  }, [activeId, pedidos, close])

  return { activeId, layer1, layer2, loadingLayer2, errorLayer2, open, close, nav }
}
