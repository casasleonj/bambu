'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DeudasTrabajador } from '@/lib/deuda-trabajador-resumen'

export type EstadoCarga = 'cargando' | 'ok' | 'error'

async function leerJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Detalle de la deuda de UN trabajador (ventana de detalle y Mi perfil). */
export function useDeudasTrabajador(trabajadorId: string | null) {
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [datos, setDatos] = useState<DeudasTrabajador | null>(null)

  const cargar = useCallback(async () => {
    if (!trabajadorId) return
    setEstado('cargando')
    try {
      const data = await leerJson<DeudasTrabajador>(`/api/trabajadores/${trabajadorId}/deudas-pendientes`)
      setDatos(data)
      setEstado('ok')
    } catch {
      setEstado('error')
    }
  }, [trabajadorId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al abrir / al cambiar de trabajador
    void cargar()
  }, [cargar])

  return { estado, datos, reintentar: cargar }
}
