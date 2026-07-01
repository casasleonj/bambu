/**
 * useCancelarPedido Hook.
 *
 * Handles pedido cancelación via API.
 * Offline-first: si la red falla, encola y notifica.
 */

import { useState, useCallback } from 'react'
import { generateUUID } from '@/lib/uuid'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'

export interface CancelarPedidoPayload {
  pedidoId: string
  motivo?: string
}

export interface UseCancelarPedidoOptions {
  onSuccess?: () => void
  onError?: (error: string) => void
}

export function useCancelarPedido(options?: UseCancelarPedidoOptions) {
  const [submitting, setSubmitting] = useState(false)
  const [pendingOffline, setPendingOffline] = useState<string[]>([])

  const cancelar = useCallback(async (payload: CancelarPedidoPayload): Promise<boolean> => {
    setSubmitting(true)
    try {
      const result = await fetchResilient<{ success: boolean; error?: { message?: string } }>(
        `/api/pedidos/${payload.pedidoId}/cancelar`,
        {
          method: 'POST',
          body: { motivo: payload.motivo, offlineId: generateUUID() },
          localEndpoint: 'cancelar-pedido',
        }
      )

      if (result.status === 'ok') {
        options?.onSuccess?.()
        toast.success('Pedido cancelado correctamente')
        return true
      }

      if (result.status === 'offline') {
        setPendingOffline(prev => [...prev, result.localId])
        toast.info('Sin conexión. Cancelación guardada, se enviará al recuperar la red.')
        return false
      }

      options?.onError?.(result.error)
      toast.error(result.error)
      return false
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { cancelar, submitting, pendingOffline }
}
