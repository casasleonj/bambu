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
  // PR-1B (Adenda v1.2 §3.2): misión cuyo vehículo sacó el producto. Se congela
  // al capturar la entrega (también al encolar offline). Ausente = entrega en
  // punto/oficina sin custodia de vehículo → no genera movimiento físico.
  embarqueEntregaId?: string
  // El cliente retiró el pedido: entregado + suelto del embarque, sin salida física.
  clienteRetiro?: boolean
  fotoEntrega?: string
  gpsLat?: number
  gpsLng?: number
  gpsAccuracy?: number
  gpsJustificacion?: string
  entregadoConGps?: boolean
  codigoVisita?: string
  // Clave de idempotencia del envío. Si la pantalla la fija (una por "borrador" de
  // entrega) el reintento tras un error/timeout la reutiliza y el servidor no cobra
  // dos veces; si falta se genera una nueva por llamada (comportamiento previo).
  offlineId?: string
}

export interface EntregarPedidoResult {
  pedido: unknown
  hijo?: unknown
  // Otro envío ya había entregado este pedido: el cobro de este NO se registró.
  pagosNoAplicados?: boolean
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
      const { offlineId, ...resto } = payload
      const result = await fetchResilient<{ success: boolean; pedido: unknown; hijo?: unknown; pagosNoAplicados?: boolean; error?: { message?: string } }>(
        `/api/pedidos/${payload.pedidoId}/entrega`,
        {
          method: 'POST',
          body: { ...resto, offlineId: offlineId ?? generateUUID() },
          localEndpoint: 'entregar-pedido',
        }
      )

      if (result.status === 'ok') {
        const ok = { pedido: result.data.pedido, hijo: result.data.hijo, pagosNoAplicados: result.data.pagosNoAplicados } as EntregarPedidoResult
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
