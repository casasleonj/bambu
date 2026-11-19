'use client'

import { useEffect, useRef } from 'react'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'
import type { DraftPedido, WorkspaceErrorKind } from './types'
import { isPreviewable, previewRequestKey } from './preview-request'

const DEBOUNCE_MS = 400

export interface UsePreviewCallbacks {
  onPending: (revision: number) => void
  onReceived: (preview: PreviewPedidoResult, revision: number) => void
  onError: (kind: WorkspaceErrorKind, message: string, revision: number) => void
}

/** El cleanup cancela incluso durante debounce o parseo. La revisión viaja
 * al reducer para descartar respuestas previas al próximo effect.
 * El commit conserva su propia validación.
 */
export function usePreview(draft: DraftPedido, cb: UsePreviewCallbacks, opts?: { pedidoId?: string; borradorId?: string; revision?: number; enabled?: boolean }): void {
  const cbRef = useRef(cb)
  useEffect(() => { cbRef.current = cb }, [cb])
  const key = previewRequestKey(draft, opts?.pedidoId, opts?.borradorId)
  const revision = opts?.revision ?? 0
  const previewable = opts?.enabled !== false && isPreviewable(draft)

  useEffect(() => {
    if (!previewable) return
    const controller = new AbortController()
    let active = true
    const timer = setTimeout(async () => {
      if (!active) return
      cbRef.current.onPending(revision)
      let res: Response
      try {
        res = await fetch('/api/pedidos/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: key,
          signal: controller.signal,
        })
      } catch (err) {
        if (!active || controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
        cbRef.current.onError('NETWORK_ERROR', 'Sin conexión — se recalcula al confirmar', revision)
        return
      }
      if (!active) return
      try {
        const data = await res.json()
        if (!active) return
        if (!res.ok || data?.success !== true || !data?.calculation || !Array.isArray(data?.allowedActions)) {
          cbRef.current.onError('VALIDATION_ERROR', data?.error?.message ?? 'No se pudo preparar el pedido', revision)
          return
        }
        const { success, ...preview } = data
        void success
        cbRef.current.onReceived(preview as PreviewPedidoResult, revision)
      } catch {
        if (active) cbRef.current.onError('VALIDATION_ERROR', 'No se pudo preparar el pedido', revision)
      }
    }, DEBOUNCE_MS)

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, revision, previewable])
}
