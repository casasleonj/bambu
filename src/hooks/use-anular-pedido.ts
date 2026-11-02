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
import { formatCurrency } from '@/lib/utils'
import { hayParteYaUsada, mensajeSaldoFavor, type ResultadoSaldoFavor } from '@/lib/saldo-favor-mensajes'

export interface AnularPedidoPayload {
  pedidoId: string
  motivo?: string
  devolverStock?: boolean
}

export interface UseAnularPedidoOptions {
  onSuccess?: () => void
  onError?: (error: string) => void
  /**
   * #577: parte del saldo a favor del pedido ya se había usado en otros pedidos. La pantalla lo muestra
   * en un aviso que no se cierra solo. Sin esta función, el aviso va dentro del mensaje.
   */
  onSaldoFavorYaUsado?: (mensaje: string) => void
}

export function useAnularPedido(options?: UseAnularPedidoOptions) {
  const [submitting, setSubmitting] = useState(false)
  const [pendingOffline, setPendingOffline] = useState<string[]>([])

  const anular = useCallback(async (payload: AnularPedidoPayload): Promise<boolean> => {
    setSubmitting(true)
    try {
      const result = await fetchResilient<{ success: boolean; hijosAnulados?: number; error?: { message?: string } } & ResultadoSaldoFavor>(
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
        const base = hijos > 0
          ? `Pedido anulado junto con ${hijos} pedido${hijos === 1 ? '' : 's'} hijo${hijos === 1 ? '' : 's'}`
          : 'Pedido anulado correctamente'
        const saldoFavor = mensajeSaldoFavor(result.data, formatCurrency)
        if (saldoFavor && hayParteYaUsada(result.data) && options?.onSaldoFavorYaUsado) {
          toast.success(base)
          options.onSaldoFavorYaUsado(saldoFavor)
        } else {
          toast.success(saldoFavor ? `${base}. ${saldoFavor}` : base, saldoFavor ? { duration: 10000 } : undefined)
        }
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
