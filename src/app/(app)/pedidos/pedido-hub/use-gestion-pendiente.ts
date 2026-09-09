'use client'

import { useCallback, useRef, useState } from 'react'
import { fetchResilient } from '@/lib/fetch-resilient'
import { generateUUID } from '@/lib/uuid'
import type {
  ProyectarGestionPendienteResult,
  AccionN2,
} from '@/modules/embarques/application/use-cases/ProyectarGestionPendienteUseCase'

type Modo = 'PUNTO' | 'DOMICILIO'

export interface ProyectarInput {
  accion: AccionN2
  producto?: string
  cantidad?: number
  modoDestino?: Modo
  actividadId?: string
}

/**
 * 409 que el backend ya explica como **regla de negocio** — el mensaje
 * contextual basta, NO es un conflicto de concurrencia (Fase 9 F9-iii, P5).
 * Cualquier otro 409 (estado cambió, obligación creada por otra sesión, …)
 * se trata como conflicto → recovery contextual.
 */
const N2_REGLA_NEGOCIO_409 = ['CANTIDAD_EXCEDE_PENDIENTE', 'ACTIVIDAD_SIN_MODO'] as const

export interface MutarResultado {
  ok: boolean
  offline?: boolean
  /** 409 de concurrencia/estado: algo cambió mientras editabas → hay que
   *  revisar el estado actual antes de reintentar. NO es éxito, NO se
   *  auto-reintenta (F9-iii, P5.A). */
  conflicto?: boolean
  /** 409 de una regla ya explicada por el backend → el mensaje contextual
   *  basta; no se generaliza a "conflicto" (F9-iii, P5.B). */
  reglaNegocio?: boolean
  error?: string
}

/**
 * Hook del flujo N2 en el Hub (plan Fase 5, P2/P3). Semántica B:
 * `proyectar()` (read-only) → el usuario revisa el impacto → `confirmar*()`
 * (muta, offline-first). El backend revalida y recalcula todo en el commit.
 */
export function useGestionPendiente(pedidoId: string, onMutado: () => void) {
  const [proyeccion, setProyeccion] = useState<ProyectarGestionPendienteResult | null>(null)
  const [proyectando, setProyectando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const proyectar = useCallback(async (input: ProyectarInput) => {
    const req = ++reqRef.current
    setProyectando(true)
    setError(null)
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/gestionar-pendiente/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })
      const j = await res.json()
      if (req !== reqRef.current) return
      if (!res.ok || j?.success === false) {
        setError(j?.error?.message ?? j?.error ?? 'No se pudo calcular el impacto')
        setProyeccion(null)
        return
      }
      const { success: _s, ...proy } = j
      setProyeccion(proy as ProyectarGestionPendienteResult)
    } catch {
      if (req !== reqRef.current) return
      setError('Sin conexión — el impacto se calcula al confirmar')
      setProyeccion(null)
    } finally {
      if (req === reqRef.current) setProyectando(false)
    }
  }, [pedidoId])

  const limpiar = useCallback(() => {
    reqRef.current++
    setProyeccion(null)
    setProyectando(false)
    setError(null)
  }, [])

  async function mutar(url: string, body: Record<string, unknown>, localEndpoint: string): Promise<MutarResultado> {
    setConfirmando(true)
    setError(null)
    const r = await fetchResilient<{ error?: string }>(url, { method: 'POST', body, localEndpoint })
    setConfirmando(false)
    if (r.status === 'ok') { limpiar(); onMutado(); return { ok: true } }
    if (r.status === 'offline') { limpiar(); onMutado(); return { ok: true, offline: true } }
    // status === 'error'. Distinguir A (concurrencia) de B (regla de negocio
    // ya explicada) — no todo 409 es un conflicto (F9-iii, P5).
    const es409 = r.statusCode === 409
    const reglaNegocio = es409 && N2_REGLA_NEGOCIO_409.some((c) => (r.error ?? '').includes(c))
    const conflicto = es409 && !reglaNegocio
    setError(r.error || 'Error al aplicar la acción')
    return { ok: false, conflicto, reglaNegocio, error: r.error }
  }

  const confirmarGestion = useCallback(
    (i: { producto: string; cantidad: number; modoInicial: Modo }) =>
      mutar(`/api/pedidos/${pedidoId}/gestionar-pendiente`,
        { producto: i.producto, cantidad: i.cantidad, modoInicial: i.modoInicial, offlineId: generateUUID() },
        'gestionar-pendiente'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidoId, onMutado],
  )

  const confirmarCambioModo = useCallback(
    (i: { actividadId: string; modoDestino: Modo }) =>
      mutar(`/api/actividades/${i.actividadId}/cambiar-modo`,
        { modoDestino: i.modoDestino, offlineId: generateUUID() },
        'cambiar-modo-actividad'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onMutado],
  )

  const confirmarLiberar = useCallback(
    (i: { actividadId: string; motivo: string }) =>
      mutar(`/api/actividades/${i.actividadId}/liberar`,
        { motivo: i.motivo, offlineId: generateUUID() },
        'liberar-actividad'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onMutado],
  )

  return {
    proyeccion, proyectando, confirmando, error,
    proyectar, limpiar,
    confirmarGestion, confirmarCambioModo, confirmarLiberar,
  }
}
