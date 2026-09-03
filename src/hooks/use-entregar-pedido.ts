/**
 * useEntregarPedido Hook.
 *
 * Handles pedido delivery via API.
 * Replaces direct fetch('/api/pedidos/[id]/entrega', { method: 'POST' }) calls.
 * Offline-first: si la red falla, encola y notifica.
 */

import { useState, useCallback } from 'react'
import { generateUUID } from '@/lib/uuid'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'

export interface EntregarPedidoPayload {
  pedidoId: string
  itemsEntregados?: Array<{ producto: string; cantidad: number }>
  pagos?: Array<{ metodo: string; monto: number }>
  // ADR-PAGO-EMBARQUE-CAPTURA-001: embarque de captura del cobro. Obligatorio
  // (400) si `pagos` trae montos. La app captura el embarque de la ruta en el
  // momento de la entrega y lo congela (incluso al encolar offline).
  embarqueId?: string
  fotoEntrega?: string
  gpsLat?: number
  gpsLng?: number
  gpsAccuracy?: number
  gpsJustificacion?: string
  entregadoConGps?: boolean
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
          body: { ...payload, offlineId: generateUUID() },
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
