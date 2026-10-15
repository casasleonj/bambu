'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { generateUUID } from '@/lib/uuid'

/** Lo que el Hub muestra de una solicitud de excepción de crédito (P0-3, #357). */
export interface ExcepcionVista {
  id: string
  estado: 'PENDIENTE' | 'AUTORIZADA' | 'RECHAZADA'
  motivoSolicitud: string
  /** saldo que autorizó la persona (snapshot de la operación al solicitar). */
  saldoAutorizado?: number
  autorizadoPorNombre?: string | null
  rechazadoPorNombre?: string | null
  notaRechazo?: string | null
}

const POLL_MS = 10_000

interface DetalleApi {
  id: string
  estado: ExcepcionVista['estado']
  motivoSolicitud: string
  operacionSaldoSnapshot?: number
  autorizadoPor?: { nombre?: string | null } | null
  rechazadoPor?: { nombre?: string | null } | null
  notaRechazo?: string | null
}

function toVista(d: DetalleApi): ExcepcionVista {
  return {
    id: d.id,
    estado: d.estado,
    motivoSolicitud: d.motivoSolicitud,
    saldoAutorizado: d.operacionSaldoSnapshot,
    autorizadoPorNombre: d.autorizadoPor?.nombre ?? null,
    rechazadoPorNombre: d.rechazadoPor?.nombre ?? null,
    notaRechazo: d.notaRechazo ?? null,
  }
}

export interface UseExcepcionCreditoOptions {
  /** se llama cuando la solicitud queda AUTORIZADA (el borrador pasa a llevar su id). */
  onAutorizada?: (excepcionId: string) => void
}

export interface SolicitarExcepcionParams {
  motivo: string
  nota?: string
  total: number
  totalPagado: number
}

/**
 * Solicitud de excepción de crédito desde el workspace (P0-3, #357).
 *
 * - Pedirla necesita conexión: la decisión es del servidor (Autoridad de
 *   Crédito). Sin red se avisa y el borrador se conserva.
 * - La clave de la solicitud (`offlineId`) se reusa si el envío se repite, así
 *   un reintento no crea dos solicitudes.
 * - Mientras está PENDIENTE se consulta su estado cada 10 s (fetch plano; no se
 *   encola en Dexie).
 */
export function useExcepcionCredito(clienteId: string | null | undefined, options?: UseExcepcionCreditoOptions) {
  const [excepcion, setExcepcion] = useState<ExcepcionVista | null>(null)
  const [solicitando, setSolicitando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clave, setClave] = useState(generateUUID)

  // la excepción es de UN cliente: al cambiar, se descarta (reset en render, sin efecto).
  const [prevCliente, setPrevCliente] = useState(clienteId)
  if (prevCliente !== clienteId) {
    setPrevCliente(clienteId)
    setExcepcion(null)
    setError(null)
    setClave(generateUUID())
  }

  const onAutorizadaRef = useRef(options?.onAutorizada)
  useEffect(() => { onAutorizadaRef.current = options?.onAutorizada }, [options?.onAutorizada])

  const aplicar = useCallback((vista: ExcepcionVista) => {
    setExcepcion(vista)
    if (vista.estado === 'AUTORIZADA') onAutorizadaRef.current?.(vista.id)
  }, [])

  const pendienteId = excepcion?.estado === 'PENDIENTE' ? excepcion.id : null
  useEffect(() => {
    if (!pendienteId) return
    let vivo = true
    const consultar = async () => {
      try {
        const res = await fetch(`/api/pedidos/excepciones-credito/${pendienteId}`)
        if (!res.ok) return
        const data = await res.json()
        if (vivo && data?.excepcion) aplicar(toVista(data.excepcion as DetalleApi))
      } catch {
        // sin red: se reintenta en el próximo tick
      }
    }
    const t = setInterval(consultar, POLL_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [pendienteId, aplicar])

  const solicitar = useCallback(async (p: SolicitarExcepcionParams) => {
    if (!clienteId) return
    setSolicitando(true)
    setError(null)
    // Reintento tras un fallo de red (aún no hay solicitud): misma clave → el
    // servidor deduplica. Si ya hubo una solicitud (rechazada / que ya no
    // cubre), esta es OTRA: clave nueva, o el servidor devolvería la anterior.
    const claveEnvio = excepcion ? generateUUID() : clave
    try {
      const res = await fetch('/api/pedidos/excepciones-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          motivoSolicitud: p.motivo,
          notaSolicitud: p.nota || undefined,
          operacion: { total: p.total, totalPagado: p.totalPagado },
          offlineId: claveEnvio,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || data?.success === false || !data?.id) {
        setError(data?.error?.message ?? 'No se pudo enviar la solicitud. Intenta de nuevo.')
        return
      }
      setExcepcion({ id: data.id as string, estado: 'PENDIENTE', motivoSolicitud: p.motivo })
    } catch {
      setError('Sin conexión: pedir una excepción necesita internet. Tu borrador se conserva; reintenta al reconectar.')
    } finally {
      setSolicitando(false)
    }
  }, [clienteId, clave, excepcion])

  /** descarta la solicitud actual (rechazada / ya no cubre) para poder pedir otra. */
  const reiniciar = useCallback(() => {
    setExcepcion(null)
    setError(null)
    setClave(generateUUID())
  }, [])

  return { excepcion, solicitando, error, solicitar, reiniciar }
}
