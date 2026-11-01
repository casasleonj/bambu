'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeudasTrabajador, ResumenDeudaTrabajador } from '@/lib/deuda-trabajador-resumen'

export type EstadoCarga = 'cargando' | 'ok' | 'error'

async function leerJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Total pendiente por trabajador (tarjetas de /trabajadores). Se refresca solo cada 60 s. */
export function useDeudasResumen() {
  const [estado, setEstado] = useState<EstadoCarga>('cargando')
  const [resumen, setResumen] = useState<Record<string, ResumenDeudaTrabajador>>({})
  const cargado = useRef(false)

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setEstado('cargando')
    try {
      const data = await leerJson<{ resumen: Record<string, ResumenDeudaTrabajador> }>('/api/trabajadores/deudas-resumen')
      setResumen(data.resumen ?? {})
      cargado.current = true
      setEstado('ok')
    } catch {
      // Un refresco silencioso fallido conserva lo último que se vio; el primero muestra el error.
      if (!silencioso || !cargado.current) setEstado('error')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al montar
    void cargar()
    const t = setInterval(() => {
      if (!document.hidden) void cargar(true)
    }, 60_000)
    return () => clearInterval(t)
  }, [cargar])

  return { estado, resumen, reintentar: () => cargar() }
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
