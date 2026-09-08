'use client'

import { useCallback, useRef, useState } from 'react'
import { fetchResilient } from '@/lib/fetch-resilient'
import { generateUUID } from '@/lib/uuid'
import type {
  ProyectarAjusteCantidadResult,
  AjusteGuardCode,
} from '@/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase'

const GUARD_CODES: AjusteGuardCode[] = [
  'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA',
  'CORRECCION_PEDIDO_CERRADO',
  'CORRECCION_GENERARIA_SOBREPAGO',
]

function guardFromMessage(msg: string): AjusteGuardCode | undefined {
  return GUARD_CODES.find((c) => msg.includes(c))
}

export interface ConfirmarCorreccionResultado {
  ok: boolean
  offline?: boolean
  /** el commit rechazó por un guard de G11 (409 + code). */
  guard?: AjusteGuardCode
  error?: string
}

/**
 * Hook del flujo G11 rama A (corrección de cantidad) en el Hub —
 * plan Fase 6-i. Semántica preview→confirm (P7):
 *   `proyectar()` (read-only) → el usuario revisa el impacto → `confirmar()`
 *   (muta, offline-first). El backend **revalida y recalcula todo** en el
 *   commit; un guard rechazado (409) se devuelve como `guard`, sin
 *   reinterpretar la intención (P5).
 */
export function useAjusteCantidad(pedidoId: string, onMutado: () => void) {
  const [proyeccion, setProyeccion] = useState<ProyectarAjusteCantidadResult | null>(null)
  const [proyectando, setProyectando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const proyectar = useCallback(async (input: { producto: string; cantidadNueva: number }) => {
    const req = ++reqRef.current
    setProyectando(true)
    setError(null)
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/ajustar-cantidad/preview`, {
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
      setProyeccion(proy as ProyectarAjusteCantidadResult)
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

  const confirmar = useCallback(
    async (input: { producto: string; cantidadNueva: number; motivo: string }): Promise<ConfirmarCorreccionResultado> => {
      setConfirmando(true)
      setError(null)
      const r = await fetchResilient(`/api/pedidos/${pedidoId}/ajustar-cantidad`, {
        method: 'POST',
        body: { ...input, offlineId: generateUUID() },
        localEndpoint: 'ajustar-cantidad',
      })
      setConfirmando(false)
      if (r.status === 'ok') { limpiar(); onMutado(); return { ok: true } }
      if (r.status === 'offline') { limpiar(); onMutado(); return { ok: true, offline: true } }
      // status === 'error'. Los 3 guards de G11 responden 409 con el mensaje
      // prefijado por el code (`CORRECCION_*: detalle`). `fetchResilient`
      // aplana el body a string, así que el code se extrae del prefijo — sin
      // reinterpretar la intención (P5), solo se identifica el guard.
      const guard = r.statusCode === 409 ? guardFromMessage(r.error) : undefined
      setError(r.error || 'No se pudo aplicar la corrección')
      return { ok: false, guard, error: r.error }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidoId, onMutado],
  )

  return { proyeccion, proyectando, confirmando, error, proyectar, limpiar, confirmar }
}
