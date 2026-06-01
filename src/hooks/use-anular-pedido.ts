/**
 * useAnularPedido Hook.
 *
 * Handles pedido anulación via API.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

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

  const anular = useCallback(async (payload: AnularPedidoPayload): Promise<boolean> => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/pedidos/${payload.pedidoId}/anular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          motivo: payload.motivo,
          devolverStock: payload.devolverStock,
        }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        options?.onSuccess?.()
        toast.success('Pedido anulado correctamente')
        return true
      }

      const errorMsg = data.error?.message || 'Error anulando pedido'
      options?.onError?.(errorMsg)
      toast.error(errorMsg)
      return false
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error anulando pedido'
      options?.onError?.(errorMsg)
      toast.error(errorMsg)
      return false
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { anular, submitting }
}
