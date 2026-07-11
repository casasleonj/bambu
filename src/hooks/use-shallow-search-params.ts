'use client'

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'

export type ShallowParams = Record<string, string | string[] | undefined>

export interface SetShallowParamsOptions {
  history?: 'push' | 'replace'
}

export interface ShallowSearchParams {
  get: (key: string) => string | null
  getAll: (key: string) => string[]
  set: (params: ShallowParams, options?: SetShallowParamsOptions) => void
}

type Listener = () => void

let version = 0
const subscribers = new Set<Listener>()

function subscribe(listener: Listener): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function notify(): void {
  version += 1
  subscribers.forEach((listener) => listener())
}

function applyChanges(current: URLSearchParams, changes: ShallowParams): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  for (const [key, value] of Object.entries(changes)) {
    next.delete(key)
    if (value === undefined || value === null || value === '') {
      continue
    }
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== undefined && v !== null && v !== '') {
          next.append(key, v)
        }
      })
    } else {
      next.set(key, value)
    }
  }
  return next
}

function updateUrl(next: URLSearchParams, history: 'push' | 'replace'): void {
  if (typeof window === 'undefined') return
  const currentSearch = window.location.search
  const nextSearch = next.toString()
  if (currentSearch === (nextSearch ? `?${nextSearch}` : '')) return
  const url = new URL(window.location.href)
  url.search = nextSearch
  if (history === 'replace') {
    window.history.replaceState(window.history.state, '', url)
  } else {
    window.history.pushState(window.history.state, '', url)
  }
  notify()
}

/**
 * Hook para leer y escribir query params de la URL sin desmontar/remontar
 * la página. Lee desde `useSearchParams` de Next.js (SSR-safe) y escribe con
 * `window.history.pushState/replaceState`, notificando a todos los consumidores
 * para que re-rendericen sincronizados.
 */
export function useShallowSearchParams(): ShallowSearchParams {
  const searchParams = useSearchParams()
  // Flag que indica si este hook (o cualquier otro consumidor) ha mutado la URL
  // manualmente vía set(). Después de una mutación manual, Next.js puede tener
  // searchParams stale por un ciclo, así que leemos directamente de
  // window.location.search para garantizar consistencia sincrónica.
  const manualUpdateRef = useRef(false)

  const currentParams = useCallback(() => {
    if (typeof window === 'undefined') return searchParams
    if (manualUpdateRef.current) return new URLSearchParams(window.location.search)
    return searchParams
  }, [searchParams])

  // Snapshot combina el version propio (para forzar re-render cuando este hook
  // o cualquier otro consumidor muta la URL vía set) con los params de Next.js
  // (para sincronizar back/forward y SSR).
  const getSnapshot = useCallback(
    () => `${version}:${manualUpdateRef.current && typeof window !== 'undefined' ? window.location.search.slice(1) : searchParams.toString()}`,
    [searchParams],
  )
  const getServerSnapshot = useCallback(
    () => searchParams.toString(),
    [searchParams],
  )

  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return useMemo(
    () => ({
      get: (key: string) => currentParams().get(key),
      getAll: (key: string) => currentParams().getAll(key),
      set: (changes: ShallowParams, options?: SetShallowParamsOptions) => {
        const history = options?.history ?? 'push'
        const current = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : searchParams.toString())
        const next = applyChanges(current, changes)
        updateUrl(next, history)
        manualUpdateRef.current = true
      },
    }),
    [searchParams, currentParams],
  )
}
