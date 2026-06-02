/**
 * useAnularPedido Hook.
 *
 * Handles pedido anulación via API.
 * Offline-first: si la red falla, encola y notifica.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'

export interface AnularPedidoPayload {
  pedidoId: string
  motivo?: string
  devolverStock?: boolean
}

export interface UseAnularPedidoOptions {
  onSuccess?: () => void
  onError?: (error: string) => void
}

export function useAnularPedido(options?: UseAnularPedidoOptions) {
  const [submitting, setSubmitting] = useState(false)
  const [pendingOffline, setPendingOffline] = useState<string[]>([])

  const anular = useCallback(async (payload: AnularPedidoPayload): Promise<boolean> => {
    setSubmitting(true)
    try {
      const result = await fetchResilient<{ success: boolean; error?: { message?: string } }>(
        `/api/pedidos/${payload.pedidoId}/anular`,
        {
          method: 'POST',
          body: { motivo: payload.motivo, devolverStock: payload.devolverStock, offlineId: crypto.randomUUID() },
          localEndpoint: 'anular-pedido',
        }
      )

      if (result.status === 'ok') {
        options?.onSuccess?.()
        toast.success('Pedido anulado correctamente')
        return true
      }

      if (result.status === 'offline') {
        setPendingOffline(prev => [...prev, result.localId])
        toast.info('Sin conexión. Anulación guardada, se enviará al recuperar la red.')
        return false
      }

      options?.onError?.(result.error)
      toast.error(result.error)
      return false
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { anular, submitting, pendingOffline }
}
