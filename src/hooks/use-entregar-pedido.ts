/**
 * useEntregarPedido Hook.
 *
 * Handles pedido delivery via API.
 * Replaces direct fetch('/api/pedidos/[id]/entrega', { method: 'POST' }) calls.
 * Offline-first: si la red falla, encola y notifica.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'

export interface EntregarPedidoPayload {
  pedidoId: string
  tipo: 'COMPLETO' | 'PARCIAL' | 'NO_ENTREGADO'
  itemsEntregados?: Array<{ producto: string; cantidad: number }>
  pagos?: Array<{ metodo: string; monto: number }>
  nuevoEmbarqueId?: string
  fotoEntrega?: string
  gpsLat?: number
  gpsLng?: number
  codigoVisita?: string
}

export interface EntregarPedidoResult {
  pedido: unknown
  hijo?: unknown
}

export interface UseEntregarPedidoOptions {
  onSuccess?: (result: EntregarPedidoResult) => void
  onError?: (error: string) => void
}

export function useEntregarPedido(options?: UseEntregarPedidoOptions) {
  const [submitting, setSubmitting] = useState(false)
  const [pendingOffline, setPendingOffline] = useState<string[]>([])

  const entregar = useCallback(async (payload: EntregarPedidoPayload): Promise<EntregarPedidoResult | null> => {
    setSubmitting(true)
    try {
      const result = await fetchResilient<{ success: boolean; pedido: unknown; hijo?: unknown; error?: { message?: string } }>(
        `/api/pedidos/${payload.pedidoId}/entrega`,
        {
          method: 'POST',
          body: { ...payload, offlineId: crypto.randomUUID() },
          localEndpoint: 'entregar-pedido',
        }
      )

      if (result.status === 'ok') {
        const ok = { pedido: result.data.pedido, hijo: result.data.hijo } as EntregarPedidoResult
        options?.onSuccess?.(ok)
        return ok
      }

      if (result.status === 'offline') {
        setPendingOffline(prev => [...prev, result.localId])
        toast.info('Sin conexión. Entrega guardada, se enviará al recuperar la red.')
        return null
      }

      options?.onError?.(result.error)
      toast.error(result.error)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { entregar, submitting, pendingOffline }
}
