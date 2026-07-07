'use client'

import { useEffect, useState, useCallback } from 'react'
import { useBaseCaja } from '@/hooks/use-base-caja'
import { todayInBogota } from '@/lib/date-helpers'
import { fetchResilient } from '@/lib/fetch-resilient'
import { logger } from '@/lib/logger'

export type CajaBaseEditorState =
  | { status: 'loading' }
  | { status: 'sin_base' }
  | { status: 'con_base'; valor: string }
  | { status: 'cerrado'; valor: string | null }

export interface UpdateResult {
  ok: boolean
  error?: string
  offline?: boolean
}

/**
 * Hook que carga el estado actual de la base de caja (sin_base / con_base /
 * cerrado) y expone `update()` para modificarla.
 *
 * - Estado inicial: fetch paralelo a /api/cierre/last + /api/config?clave=BASE_DIA_*
 * - Update: POST a /api/config via fetchResilient (offline-first).
 *   onSuccess: setBaseDia() del hook useBaseCaja → dispara storage event
 *   que sincroniza el sidebar, dashboard y otras pestañas.
 * - Errores 4xx del server: se devuelven al caller sin reintento.
 * - Errores de red: la request queda encolada en Dexie y se reintenta
 *   automaticamente cuando vuelve la conexion. El caller recibe
 *   `{ ok: true, offline: true }` para mostrar un toast informativo.
 * - Sync cross-tab: escucha el storage event para reflejar cambios
 *   hechos por otras pestañas.
 */
export function useBaseCajaEditor() {
  const { setBaseDia } = useBaseCaja()
  const [state, setState] = useState<CajaBaseEditorState>({ status: 'loading' })
  const [isPending, setIsPending] = useState(false)

  // Carga inicial.
  useEffect(() => {
    let cancelled = false

    async function load() {
      const today = todayInBogota()
      try {
        const [cierreRes, configRes] = await Promise.all([
          fetch('/api/cierre/last'),
          fetch(`/api/config?clave=BASE_DIA_${today}`),
        ])

        if (cancelled) return

        const cierreData = cierreRes.ok ? await cierreRes.json() : { cierre: null }
        const cierreDate = cierreData.cierre
          ? new Date(cierreData.cierre.fecha).toLocaleDateString('en-CA', {
              timeZone: 'America/Bogota',
            })
          : null
        const todayClosed = cierreDate === today

        const baseValue: string | null = configRes.ok
          ? (await configRes.json()).config?.valor ?? null
          : null

        if (cancelled) return

        if (todayClosed) {
          setState({ status: 'cerrado', valor: baseValue })
          return
        }
        if (baseValue !== null && baseValue !== undefined && baseValue !== '') {
          setState({ status: 'con_base', valor: baseValue })
          return
        }
        setState({ status: 'sin_base' })
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : 'Unknown' },
          'useBaseCajaEditor: error loading state',
        )
        if (!cancelled) setState({ status: 'sin_base' })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Sync cross-tab: si otra pestaña edita la base, el storage event actualiza
  // `useBaseCaja` pero no este state. Escuchamos el evento directamente.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (!e.key || !e.key.startsWith('baseDia_')) return
      const todayKey = `baseDia_${todayInBogota()}`
      if (e.key !== todayKey) return
      const newVal = e.newValue
      if (newVal) {
        setState((prev) =>
          prev.status === 'cerrado' || prev.status === 'sin_base' || prev.status === 'loading'
            ? prev
            : { status: 'con_base', valor: newVal },
        )
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback(
    async (newValor: string): Promise<UpdateResult> => {
      const today = todayInBogota()
      const clave = `BASE_DIA_${today}`

      setIsPending(true)
      try {
        const result = await fetchResilient<{ config?: { valor: string } }>('/api/config', {
          method: 'POST',
          body: { clave, valor: newValor },
          localEndpoint: 'caja-base-editor',
        })

        if (result.status === 'ok') {
          setBaseDia(newValor)
          setState({ status: 'con_base', valor: newValor })
          return { ok: true }
        }

        if (result.status === 'offline') {
          setBaseDia(newValor)
          setState({ status: 'con_base', valor: newValor })
          return { ok: true, offline: true }
        }

        return { ok: false, error: result.error }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        logger.error({ err: msg }, 'useBaseCajaEditor: update failed')
        return { ok: false, error: msg }
      } finally {
        setIsPending(false)
      }
    },
    [setBaseDia],
  )

  return { state, update, isPending }
}
