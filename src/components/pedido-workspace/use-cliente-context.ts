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

type ContextState = Omit<ClienteContext, 'loadPatron'> & { clienteId: string | null; generation: number }
type ActiveContext = { generation: number; controller: AbortController; patronPending: boolean }
function empty(clienteId: string | null, generation: number): ContextState {
  return { clienteId, generation, fiadoStatus: null, patron: null, patronLoading: false }
}

/** #891: una generación por selección, no por id solamente (A→B→A).
 * Los updates de contexto no pueden alcanzar a una selección posterior.
 * Mantiene patrón bajo demanda, lecturas frescas y sin caché financiero.
 */
export function useClienteContext(clienteId: string | null): ClienteContext {
  const [context, setContext] = useState(() => empty(clienteId, 0))
  const activeRef = useRef<ActiveContext | null>(null)
  if (context.clienteId !== clienteId) {
    setContext(empty(clienteId, context.generation + 1))
  }
  const generation = context.generation

  useEffect(() => {
    if (!isReal(clienteId)) return
    const controller = new AbortController()
    const active: ActiveContext = { generation, controller, patronPending: false }
    activeRef.current = active
    const current = () => activeRef.current === active && !controller.signal.aborted
    const update = (status: FiadoStatus | null) => {
      if (!current()) return
      setContext(prev => prev.generation === generation ? { ...prev, fiadoStatus: status } : prev)
    }
    fetch(`/api/clientes/${clienteId}/fiado-status`, { signal: controller.signal, cache: 'no-store' })
      .then(r => r.json())
      .then(d => update(d?.success && d.status ? d.status : null))
      .catch(() => update(null))
    return () => {
      controller.abort()
      if (activeRef.current === active) activeRef.current = null
    }
  }, [clienteId, generation])

  const loadPatron = useCallback(() => {
    const active = activeRef.current
    if (!isReal(clienteId) || context.patronLoading || context.patron || !active ||
      active.generation !== generation || active.controller.signal.aborted || active.patronPending) return
    active.patronPending = true
    const current = () => activeRef.current === active && !active.controller.signal.aborted
    const update = (part: Partial<Pick<ContextState, 'patron' | 'patronLoading'>>) => {
      if (!current()) return
      setContext(prev => prev.generation === generation ? { ...prev, ...part } : prev)
    }
    update({ patronLoading: true })
    fetchClienteDetailFresh<{
      frecuenciaSugerida?: { dias: number; label: string } | null
      productosSugeridos?: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }>
    }>(clienteId, active.controller.signal).then(result => {
      if (result.ok) {
        update({
          patron: {
            frecuenciaSugerida: result.cliente.frecuenciaSugerida ?? null,
            productosSugeridos: result.cliente.productosSugeridos ?? [],
          },
        })
      }
    }).catch(() => update({ patron: null })).finally(() => {
      active.patronPending = false
      update({ patronLoading: false })
    })
  }, [clienteId, generation, context.patron, context.patronLoading])

  return {
    fiadoStatus: context.clienteId === clienteId ? context.fiadoStatus : null,
    patron: context.clienteId === clienteId ? context.patron : null,
    patronLoading: context.clienteId === clienteId && context.patronLoading,
    loadPatron,
  }
}
