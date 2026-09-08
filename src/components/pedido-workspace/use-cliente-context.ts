'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchClienteDetailFresh } from '@/lib/cliente-detail-cache'
import type { FiadoStatus } from '@/modules/pedidos/domain/types'
import type { PatronConsumo } from '@/components/pedido-form-unified'

export interface ClienteContext {
  fiadoStatus: FiadoStatus | null
  patron: PatronConsumo | null
  patronLoading: boolean
  /** carga perezosa del patrón de consumo (acción explícita, offline-first). */
  loadPatron: () => void
}

function isReal(clienteId: string | null): clienteId is string {
  return !!clienteId && clienteId !== 'CONSUMIDOR_FINAL'
}

/**
 * Contexto del cliente para el PedidosWorkspace (C1b): banner de fiados y
 * patrón de consumo. Mismo comportamiento que el monolito `pedido-form-unified`:
 * - `fiado-status` se carga al seleccionar cliente (abortable, guard anti-carrera).
 * - el patrón de consumo NO se carga solo (2G/3G): se dispara con `loadPatron()`.
 * `CONSUMIDOR_FINAL` no tiene contexto (venta anónima).
 */
export function useClienteContext(clienteId: string | null): ClienteContext {
  const [fiadoStatus, setFiadoStatus] = useState<FiadoStatus | null>(null)
  const [patron, setPatron] = useState<PatronConsumo | null>(null)
  const [patronLoading, setPatronLoading] = useState(false)
  const idRef = useRef<string | null>(clienteId)

  // Reset en render al cambiar de cliente — evita mostrar datos del cliente
  // anterior mientras el nuevo fetch está en vuelo (patrón sancionado:
  // https://react.dev/learn/you-might-not-need-an-effect).
  const [prevClienteId, setPrevClienteId] = useState(clienteId)
  if (clienteId !== prevClienteId) {
    setPrevClienteId(clienteId)
    setFiadoStatus(null)
    setPatron(null)
    setPatronLoading(false)
  }

  useEffect(() => {
    idRef.current = clienteId
    if (!isReal(clienteId)) return
    const captured = clienteId
    const controller = new AbortController()

    fetch(`/api/clientes/${captured}/fiado-status`, { signal: controller.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (controller.signal.aborted || idRef.current !== captured) return
        setFiadoStatus(d?.success && d.status ? d.status : null)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setFiadoStatus(null)
      })

    return () => controller.abort()
  }, [clienteId])

  const loadPatron = useCallback(() => {
    if (!isReal(clienteId) || patronLoading || patron) return
    const captured = clienteId
    setPatronLoading(true)
    fetchClienteDetailFresh<{
      frecuenciaSugerida?: { dias: number; label: string } | null
      productosSugeridos?: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }>
    }>(captured).then((result) => {
      if (idRef.current !== captured) return
      setPatronLoading(false)
      if (result.ok) {
        setPatron({
          frecuenciaSugerida: result.cliente.frecuenciaSugerida ?? null,
          productosSugeridos: result.cliente.productosSugeridos ?? [],
        })
      }
    }).catch(() => setPatronLoading(false))
  }, [clienteId, patron, patronLoading])

  return { fiadoStatus, patron, patronLoading, loadPatron }
}
