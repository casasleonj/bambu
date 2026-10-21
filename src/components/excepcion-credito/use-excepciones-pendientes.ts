'use client'

import { useCallback, useEffect, useState } from 'react'

export interface ExcepcionPendiente {
  id: string
  motivoSolicitud: string
  solicitadoAt: string
  operacionSaldoSnapshot: number
  cliente: { id: string; nombre: string }
  solicitadoPor: { id: string; nombre: string }
}

const POLL_MS = 30_000

/**
 * Solicitudes de excepción de crédito PENDIENTES (P0-3, PR 2).
 *
 * El servidor solo las entrega a quien tiene el permiso por usuario; para el
 * resto responde lista vacía y `puedeResolver: false`, y el aviso no aparece.
 * Se refresca cada 30 s mientras la pestaña está visible y al volver a ella
 * (fetch plano: es una lectura, no se encola en Dexie).
 */
export function useExcepcionesPendientes(enabled = true) {
  const [excepciones, setExcepciones] = useState<ExcepcionPendiente[]>([])
  const [puedeResolver, setPuedeResolver] = useState(false)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/pedidos/excepciones-credito')
      if (!res.ok) return
      const data = await res.json()
      setPuedeResolver(data?.puedeResolver === true)
      setExcepciones(Array.isArray(data?.excepciones) ? (data.excepciones as ExcepcionPendiente[]) : [])
    } catch {
      // sin red: se conserva lo último que se vio y se reintenta en el próximo tick
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    // primera carga fuera del cuerpo síncrono del efecto (sin setState en cascada)
    const primera = setTimeout(() => { void refetch() }, 0)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refetch()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(primera)
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, refetch])

  return { excepciones, puedeResolver, refetch }
}
