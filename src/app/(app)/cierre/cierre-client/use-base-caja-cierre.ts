'use client'

// #688 — el cierre LEE la base de caja de la fecha (Config BASE_DIA_<fecha>); nunca la escribe ni inventa un valor
// por defecto. Se vuelve a leer al volver a la pestaña, cada 60 s y justo antes de cerrar. Si cambia mientras la
// pantalla está abierta, avisa (antes → ahora) para que nadie cierre con un dato viejo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { EVENTO_BASE_CAJA } from '@/lib/client/base-caja-evento'

export type EstadoBaseCaja = 'cargando' | 'ingresada' | 'faltante'
export interface LecturaBase { estado: Exclude<EstadoBaseCaja, 'cargando'>; valor: number; actualizadaAt: string | null }
export interface AvisoBase { antes: number; ahora: number }

const INTERVALO_MS = 60_000

/** Lee la base de la fecha. 404 = no se ingresó. Un error de red devuelve null: no se cambia lo que ya se mostraba. */
export async function leerBaseDeLaFecha(fecha: string, signal?: AbortSignal): Promise<LecturaBase | null> {
  try {
    const res = await fetch(`/api/config?clave=BASE_DIA_${fecha}`, { signal, cache: 'no-store' })
    if (res.status === 404) return { estado: 'faltante', valor: 0, actualizadaAt: null }
    if (!res.ok) return null
    const json = await res.json() as { data?: { config?: { valor?: string; updatedAt?: string } }; config?: { valor?: string; updatedAt?: string } }
    const config = json.data?.config ?? json.config
    const valor = Number(config?.valor)
    if (!config || !Number.isFinite(valor) || valor <= 0) return { estado: 'faltante', valor: 0, actualizadaAt: null }
    return { estado: 'ingresada', valor, actualizadaAt: config.updatedAt ?? null }
  } catch {
    return null
  }
}

export function useBaseCajaCierre(fecha: string, pausado: boolean) {
  const [lectura, setLectura] = useState<LecturaBase | null>(null)
  const [aviso, setAviso] = useState<AvisoBase | null>(null)
  const actual = useRef<LecturaBase | null>(null)
  const secuencia = useRef(0)

  const aplicar = useCallback((nueva: LecturaBase) => {
    const previa = actual.current
    // Solo hay «cambio» cuando antes había una base ingresada y ahora hay otra distinta.
    if (previa?.estado === 'ingresada' && nueva.estado === 'ingresada' && previa.valor !== nueva.valor) {
      setAviso({ antes: previa.valor, ahora: nueva.valor })
    }
    actual.current = nueva
    setLectura(nueva)
  }, [])

  /** Vuelve a leer ahora. Devuelve la lectura nueva (o null si no hubo red). */
  const refrescar = useCallback(async (): Promise<LecturaBase | null> => {
    const mia = ++secuencia.current
    const nueva = await leerBaseDeLaFecha(fecha)
    if (!nueva || mia !== secuencia.current) return null // una lectura más nueva (o un cambio de fecha) la reemplazó
    aplicar(nueva)
    return nueva
  }, [fecha, aplicar])

  useEffect(() => {
    // Cambio de fecha: nada de lo anterior vale para el día nuevo.
    actual.current = null
    secuencia.current++
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLectura(null)
    setAviso(null)
    void refrescar()
  }, [fecha, refrescar])

  useEffect(() => {
    if (pausado) return
    const id = setInterval(() => { void refrescar() }, INTERVALO_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') void refrescar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    const alGuardar = () => { void refrescar() }
    window.addEventListener(EVENTO_BASE_CAJA, alGuardar)
    return () => {
      window.removeEventListener(EVENTO_BASE_CAJA, alGuardar)
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [pausado, refrescar])

  const estado: EstadoBaseCaja = lectura?.estado ?? 'cargando'
  return {
    estado,
    valor: lectura?.estado === 'ingresada' ? lectura.valor : 0,
    actualizadaAt: lectura?.actualizadaAt ?? null,
    aviso,
    descartarAviso: useCallback(() => setAviso(null), []),
    refrescar,
  }
}
