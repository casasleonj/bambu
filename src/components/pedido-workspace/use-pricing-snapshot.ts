'use client'

import { useCallback, useEffect, useState } from 'react'
import { onPriceUpdate } from '@/lib/price-sync'
import type { PricingData } from '@/modules/pedidos/domain/repositories/IPricingPort'
import type { DraftPedido } from './types'

export interface PricingSnapshot {
  clienteId: string
  negocioId: string | null
  canal: 'PUNTO' | 'DOMICILIO'
  version: string
  pricing: PricingData
}

interface ScopedSnapshot {
  key: string
  data: PricingSnapshot
}

/**
 * #925: una sola carga por comprador/canal, más invalidación al regresar
 * a la pestaña, reconectar, cambio entre pestañas o revisión periódica.
 * NO depende de cantidad, precio manual ni pagos. No guarda preferencias
 * personales en caché persistente ni reutiliza respuestas entre compradores.
 */
export function usePricingSnapshot(draft: DraftPedido): {
  data: PricingSnapshot | null
  loading: boolean
  reload: () => void
} {
  const telefono = !draft.clienteId ? draft.clienteNuevo?.telefono?.trim() : undefined
  const key = JSON.stringify([
    draft.clienteId ?? null,
    draft.negocioId ?? null,
    draft.canal,
    telefono || null,
  ])
  const ready = Boolean(draft.clienteId || telefono)
  const [saved, setSaved] = useState<ScopedSnapshot | null>(null)
  const [request, setRequest] = useState<{ key: string; loading: boolean } | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    setRequest({ key, loading: true })

    const [clienteId, negocioId, canal, clienteNuevoTelefono] = JSON.parse(key) as [
      string | null, string | null, 'PUNTO' | 'DOMICILIO', string | null,
    ]

    void fetch('/api/precios/cotizacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        clienteId,
        negocioId,
        canal,
        clienteNuevoTelefono: clienteNuevoTelefono ?? undefined,
      }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Contexto de precios no disponible')
      const body: unknown = await response.json()
      if (!body || typeof body !== 'object' || !('success' in body) || body.success !== true ||
          !('pricing' in body) || !('version' in body) || typeof body.version !== 'string') {
        throw new Error('Respuesta inválida del contexto de precios')
      }
      if (!controller.signal.aborted) {
        setSaved({ key, data: body as PricingSnapshot })
      }
    }).catch(() => {
      // Fail closed: ante error no se inventan precios. El preview puede
      // seguir funcionando y el commit conserva la autoridad del servidor.
    }).finally(() => {
      if (!controller.signal.aborted) setRequest({ key, loading: false })
    })
    return () => controller.abort()
  }, [key, nonce, ready])

  useEffect(() => {
    if (!ready) return
    const onFocus = () => reload()
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload()
    }
    const unsubscribe = onPriceUpdate(reload)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(reload, 60_000)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [reload, ready])

  const data = ready && saved?.key === key ? saved.data : null
  return {
    data,
    loading: ready && (request?.key !== key || request.loading),
    reload,
  }
}
