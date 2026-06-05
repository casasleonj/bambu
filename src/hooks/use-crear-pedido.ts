/**
 * useCrearPedido Hook.
 *
 * Handles pedido creation via API.
 * Replaces direct fetch('/api/pedidos', { method: 'POST' }) calls.
 * Offline-first: si la red falla, encola en IndexedDB y avisa al usuario.
 */

import { useState, useCallback } from 'react'
import { generateUUID } from '@/lib/uuid'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'

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
  const [pendingOffline, setPendingOffline] = useState<string[]>([])

  const create = useCallback(async (payload: CrearPedidoPayload): Promise<CrearPedidoResult | null> => {
    setSubmitting(true)
    try {
      // Offline-first: generamos offlineId en cliente para que la dedup server-side
      // (Pedido.offlineId @unique en schema) funcione tanto en el envío online
      // como en el replay de la cola offline. Si NO se incluye, dos requests
      // con el mismo payload crean dos pedidos duplicados.
      // Bug original: este hook NO enviaba offlineId (C-2). Test regresión:
      // e2e/offline-first/crear-pedido-hook-dedup.spec.ts
      const offlineId = generateUUID()
      const result = await fetchResilient<{ success: boolean; pedido: unknown; error?: { message?: string } }>(
        '/api/pedidos',
        { method: 'POST', body: { ...payload, offlineId }, localEndpoint: 'crear-pedido' }
      )

      if (result.status === 'ok') {
        const data = result.data
        const ok = { pedido: data.pedido, clienteId: payload.clienteId } as CrearPedidoResult
        setLastResult(ok)
        options?.onSuccess?.(ok)
        return ok
      }

      if (result.status === 'offline') {
        // Encolado: la UI muestra el toast.info, el caller debe bloquear
        // navegación hasta que el sync complete. Exponemos el localId.
        setPendingOffline(prev => [...prev, result.localId])
        toast.info('Sin conexión. Pedido guardado, se enviará al recuperar la red.')
        return null
      }

      // status === 'error'
      options?.onError?.(result.error)
      toast.error(result.error)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [options])

  return { create, submitting, lastResult, pendingOffline }
}
