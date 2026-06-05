/**
 * useAsignarEmbarque Hook.
 *
 * Handles assigning a pedido to an embarque.
 * Offline-first: si la red falla, encola y notifica.
 */

import { useState, useCallback } from 'react'
import { generateUUID } from '@/lib/uuid'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'

export interface UseAsignarEmbarqueOptions {
  onSuccess?: () => void
  onError?: (error: string) => void
}

export function useAsignarEmbarque(options?: UseAsignarEmbarqueOptions) {
  const [submitting, setSubmitting] = useState(false)
  const [pendingOffline, setPendingOffline] = useState<string[]>([])

  const asignar = useCallback(async (pedidoId: string, embarqueId: string): Promise<boolean> => {
    setSubmitting(true)
    try {
      const result = await fetchResilient<{ success: boolean; error?: { message?: string } }>(
        `/api/pedidos/${pedidoId}/enviar`,
        {
          method: 'POST',
          body: { embarqueId, offlineId: generateUUID() },
          localEndpoint: 'asignar-embarque',
        }
      )

      if (result.status === 'ok') {
        options?.onSuccess?.()
        toast.success('Pedido asignado al embarque')
        return true
      }

      if (result.status === 'offline') {
        setPendingOffline(prev => [...prev, result.localId])
        toast.info('Sin conexión. Asignación guardada, se enviará al recuperar la red.')
        return false
      }

      options?.onError?.(result.error)
      toast.error(result.error)
      return false
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { asignar, submitting, pendingOffline }
}
