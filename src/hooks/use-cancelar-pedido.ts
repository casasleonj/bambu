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
import { formatCurrency } from '@/lib/utils'
import { hayParteYaUsada, mensajeSaldoFavor, type ResultadoSaldoFavor } from '@/lib/saldo-favor-mensajes'

export interface CancelarPedidoPayload {
  pedidoId: string
  motivo?: string
}

export interface UseCancelarPedidoOptions {
  onSuccess?: () => void
  onError?: (error: string) => void
  /**
   * #577: parte del saldo a favor del pedido ya se había usado en otros pedidos. La pantalla lo muestra
   * en un aviso que no se cierra solo. Sin esta función, el aviso va dentro del mensaje.
   */
  onSaldoFavorYaUsado?: (mensaje: string) => void
}

export function useCancelarPedido(options?: UseCancelarPedidoOptions) {
  const [submitting, setSubmitting] = useState(false)
  const [pendingOffline, setPendingOffline] = useState<string[]>([])

  const cancelar = useCallback(async (payload: CancelarPedidoPayload): Promise<boolean> => {
    setSubmitting(true)
    try {
      const result = await fetchResilient<{ success: boolean; error?: { message?: string } } & ResultadoSaldoFavor>(
        `/api/pedidos/${payload.pedidoId}/cancelar`,
        {
          method: 'POST',
          body: { motivo: payload.motivo, offlineId: generateUUID() },
          localEndpoint: 'cancelar-pedido',
        }
      )

      if (result.status === 'ok') {
        options?.onSuccess?.()
        const saldoFavor = mensajeSaldoFavor(result.data, formatCurrency)
        if (saldoFavor && hayParteYaUsada(result.data) && options?.onSaldoFavorYaUsado) {
          toast.success('Pedido cancelado correctamente')
          options.onSaldoFavorYaUsado(saldoFavor)
        } else {
          toast.success(saldoFavor ? `Pedido cancelado correctamente. ${saldoFavor}` : 'Pedido cancelado correctamente', saldoFavor ? { duration: 10000 } : undefined)
        }
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
