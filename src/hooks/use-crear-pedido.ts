/**
 * useCrearPedido Hook.
 *
 * Handles pedido creation via API.
 * Replaces direct fetch('/api/pedidos', { method: 'POST' }) calls.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

export interface CrearPedidoPayload {
  clienteId: string
  negocioId?: string
  canal: 'PUNTO' | 'DOMICILIO'
  items: Array<{
    producto: string
    cantidad: number
    precioManual?: number
  }>
  pagos?: Array<{ metodo: string; monto: number }>
  obs?: string
  fechaEntrega?: string
  ventaRapida?: boolean
  clienteNuevo?: {
    nombre: string
    apellido?: string
    telefono: string
    direccion?: string
    barrio?: string
    fuente?: string
  }
  actualizarCliente?: {
    direccion?: string
    barrio?: string
  }
}

export interface CrearPedidoResult {
  pedido: unknown
  clienteId: string
}

export interface UseCrearPedidoOptions {
  onSuccess?: (result: CrearPedidoResult) => void
  onError?: (error: string) => void
}

export function useCrearPedido(options?: UseCrearPedidoOptions) {
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<CrearPedidoResult | null>(null)

  const create = useCallback(async (payload: CrearPedidoPayload): Promise<CrearPedidoResult | null> => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        const result = { pedido: data.pedido, clienteId: payload.clienteId } as CrearPedidoResult
        setLastResult(result)
        options?.onSuccess?.(result)
        return result
      }

      const errorMsg = data.error?.message || 'Error creando pedido'
      options?.onError?.(errorMsg)
      toast.error(errorMsg)
      return null
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error creando pedido'
      options?.onError?.(errorMsg)
      toast.error(errorMsg)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { create, submitting, lastResult }
}
