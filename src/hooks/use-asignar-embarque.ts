/**
 * useAsignarEmbarque Hook.
 *
 * Handles assigning a pedido to an embarque.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

export interface UseAsignarEmbarqueOptions {
  onSuccess?: () => void
  onError?: (error: string) => void
}

export function useAsignarEmbarque(options?: UseAsignarEmbarqueOptions) {
  const [submitting, setSubmitting] = useState(false)

  const asignar = useCallback(async (pedidoId: string, embarqueId: string): Promise<boolean> => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ embarqueId }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        options?.onSuccess?.()
        toast.success('Pedido asignado al embarque')
        return true
      }

      const errorMsg = data.error?.message || 'Error asignando embarque'
      options?.onError?.(errorMsg)
      toast.error(errorMsg)
      return false
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error asignando embarque'
      options?.onError?.(errorMsg)
      toast.error(errorMsg)
      return false
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { asignar, submitting }
}
