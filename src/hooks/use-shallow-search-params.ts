'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
const listeners = new Set<Listener>()

function broadcast(): void {
  listeners.forEach((fn) => fn())
}

function applyChanges(
  current: URLSearchParams,
  changes: ShallowParams,
): URLSearchParams {
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
  broadcast()
}

/**
 * Hook para leer y escribir query params de la URL sin desmontar/remontar
 * la página.
 *
 * - SSR/hydration: usa `useSearchParams` de Next.js (coincide con el render
 *   del servidor, evitando hydration mismatches).
 * - Después del primer `set()` o `popstate`: cambia permanentemente a leer
 *   desde `window.location.search` (porque `useSearchParams` no se actualiza
 *   tras manipulación manual del history).
 * - Notificación cross-consumer: usa un `Set<Listener> + broadcast()` a nivel
 *   de módulo para que todos los hooks (en distintos componentes) se enteren
 *   cuando alguien muta la URL.
 * - Re-render: usa `useState(0)` counter + `forceRender()`, no
 *   `useSyncExternalStore`, para evitar el bug de getSnapshot inestable.
 */
export function useShallowSearchParams(): ShallowSearchParams {
  const searchParams = useSearchParams()
  const [, forceRender] = useState(0)
  const useRealParamsRef = useRef(false)

  useEffect(() => {
    const onBroadcast = () => {
      useRealParamsRef.current = true
      forceRender((n) => n + 1)
    }
    listeners.add(onBroadcast)

    const onPopState = () => {
      useRealParamsRef.current = true
      forceRender((n) => n + 1)
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      listeners.delete(onBroadcast)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  const get = useCallback(
    (key: string): string | null => {
      if (typeof window !== 'undefined' && useRealParamsRef.current) {
        return new URLSearchParams(window.location.search).get(key)
      }
      return searchParams?.get(key) ?? null
    },
    [searchParams],
  )

  const getAll = useCallback(
    (key: string): string[] => {
      if (typeof window !== 'undefined' && useRealParamsRef.current) {
        return new URLSearchParams(window.location.search).getAll(key)
      }
      return searchParams?.getAll(key) ?? []
    },
    [searchParams],
  )

  const set = useCallback(
    (changes: ShallowParams, options?: SetShallowParamsOptions) => {
      const current = new URLSearchParams(
        typeof window !== 'undefined'
          ? window.location.search
          : searchParams?.toString() ?? '',
      )
      const next = applyChanges(current, changes)
      updateUrl(next, options?.history ?? 'push')
      useRealParamsRef.current = true
    },
    [searchParams],
  )

  return useMemo(() => ({ get, getAll, set }), [get, getAll, set])
}
