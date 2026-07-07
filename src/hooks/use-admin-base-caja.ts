'use client'

import { useEffect, useState } from 'react'
import { todayInBogota } from '@/lib/date-helpers'

export type AdminBaseCajaState =
  | { status: 'loading' }
  | { status: 'sin_base' }
  | { status: 'con_base'; valor: string }
  | { status: 'cerrado'; valor: string | null }

export function useAdminBaseCaja(): AdminBaseCajaState {
  const [state, setState] = useState<AdminBaseCajaState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const today = todayInBogota()

      try {
        const [cierreRes, configRes] = await Promise.all([
          fetch('/api/cierre/last'),
          fetch(`/api/config?clave=BASE_DIA_${today}`),
        ])

        const cierreData = cierreRes.ok ? await cierreRes.json() : { cierre: null }
        const cierreDate = cierreData.cierre
          ? new Date(cierreData.cierre.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
          : null
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
        const todayClosed = cierreDate === todayStr

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
      } catch (error) {
        console.error('[useAdminBaseCaja] Error loading state:', error)
        if (!cancelled) {
          setState({ status: 'sin_base' })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
