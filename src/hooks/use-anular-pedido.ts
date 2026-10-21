/**
 * useAnularPedido Hook.
 *
 * Handles pedido anulación via API.
 * Offline-first: si la red falla, encola y notifica.
 */

import { useState, useCallback } from 'react'
import { generateUUID } from '@/lib/uuid'
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
      const result = await fetchResilient<{ success: boolean; hijosAnulados?: number; error?: { message?: string } }>(
        `/api/pedidos/${payload.pedidoId}/anular`,
        {
          method: 'POST',
          body: { motivo: payload.motivo, devolverStock: payload.devolverStock, offlineId: generateUUID() },
          localEndpoint: 'anular-pedido',
        }
      )

      if (result.status === 'ok') {
        options?.onSuccess?.()
        const hijos = result.data?.hijosAnulados ?? 0
        toast.success(
          hijos > 0
            ? `Pedido anulado junto con ${hijos} pedido${hijos === 1 ? '' : 's'} hijo${hijos === 1 ? '' : 's'}`
            : 'Pedido anulado correctamente',
        )
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
