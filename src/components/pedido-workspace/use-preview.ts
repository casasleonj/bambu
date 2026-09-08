'use client'

import { useEffect, useRef } from 'react'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'
import type { DraftPedido, WorkspaceErrorKind } from './types'

const DEBOUNCE_MS = 400

export interface UsePreviewCallbacks {
  onPending: () => void
  onReceived: (preview: PreviewPedidoResult) => void
  onError: (kind: WorkspaceErrorKind, message: string) => void
}

/** ¿el draft tiene lo mínimo para pedir un preview? */
function isPreviewable(draft: DraftPedido): boolean {
  return !!draft.clienteId && draft.items.some((i) => i.cantidad > 0)
}

function toRequestBody(draft: DraftPedido) {
  return {
    clienteId: draft.clienteId,
    negocioId: draft.negocioId ?? undefined,
    canal: draft.canal,
    origen: draft.origen,
    items: draft.items
      .filter((i) => i.cantidad > 0)
      .map((i) => ({ producto: i.producto, cantidad: i.cantidad, precioManual: i.precioManual })),
    pagos: draft.pagos.length > 0 ? draft.pagos : undefined,
    entregado: draft.entregado,
    pedidoOrigenId: draft.pedidoOrigenId,
  }
}

/**
 * Debounce del draft → `POST /api/pedidos/preview`. El backend es la autoridad
 * de cálculo/riesgo/acciones (blueprint §4.1). Aborta el request anterior si
 * el draft cambia; descarta respuestas stale por `requestId`.
 *
 * Fetch plano (lectura, no encolar en Dexie). Offline → `NETWORK_ERROR`; el
 * draft local persiste igual (ALS §13).
 */
export function usePreview(draft: DraftPedido, cb: UsePreviewCallbacks): void {
  const cbRef = useRef(cb)
  useEffect(() => { cbRef.current = cb }, [cb])

  const abortRef = useRef<AbortController | null>(null)
  const reqRef = useRef(0)
  // serialización estable del subconjunto que afecta el preview
  const key = JSON.stringify(toRequestBody(draft))

  useEffect(() => {
    if (!isPreviewable(draft)) return

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const req = ++reqRef.current

      cbRef.current.onPending()
      try {
        const res = await fetch('/api/pedidos/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(JSON.parse(key)),
          signal: controller.signal,
        })
        if (req !== reqRef.current) return
        const data = await res.json()
        if (req !== reqRef.current) return
        if (!res.ok || data?.success === false) {
          cbRef.current.onError('VALIDATION_ERROR', data?.error?.message ?? 'No se pudo preparar el pedido')
          return
        }
        // apiSuccess devuelve { success, ...PreviewPedidoResult }
        const { success, ...preview } = data
        void success
        cbRef.current.onReceived(preview as PreviewPedidoResult)
      } catch (err) {
        if (req !== reqRef.current) return
        if (err instanceof Error && err.name === 'AbortError') return
        cbRef.current.onError('NETWORK_ERROR', 'Sin conexión — se recalcula al confirmar')
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // key resume el draft; draft se re-lee dentro del timeout vía closure de key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => () => abortRef.current?.abort(), [])
}
