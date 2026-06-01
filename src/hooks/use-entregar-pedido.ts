/**
 * useEntregarPedido Hook.
 *
 * Handles pedido delivery via API.
 * Replaces direct fetch('/api/pedidos/[id]/entrega', { method: 'POST' }) calls.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

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

  const entregar = useCallback(async (payload: EntregarPedidoPayload): Promise<EntregarPedidoResult | null> => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/pedidos/${payload.pedidoId}/entrega`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        const result = { pedido: data.pedido, hijo: data.hijo } as EntregarPedidoResult
        options?.onSuccess?.(result)
        return result
      }

      const errorMsg = data.error?.message || 'Error registrando entrega'
      options?.onError?.(errorMsg)
      toast.error(errorMsg)
      return null
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error registrando entrega'
      options?.onError?.(errorMsg)
      toast.error(errorMsg)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { entregar, submitting }
}
