'use client'

import { useEffect, useCallback, useId } from 'react'
import { pushModal, removeModal, isTopModal } from '@/components/modal'

/**
 * Registers a custom overlay (non-Modal) in the modal stack so that
 * only the topmost layer responds to the Escape key.
 *
 * Use this for side panels, custom dialogs, or any fixed overlay that
 * needs Escape-to-dismiss but doesn't use the <Modal> component.
 */
export function useEscapeGuard(enabled: boolean, onClose: () => void): void {
  const id = useId()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!isTopModal(id)) return
      e.stopPropagation()
      onClose()
    },
    [onClose, id],
  )

  // Register/unregister in the shared modal stack
  useEffect(() => {
    if (!enabled) return
    pushModal(id)
    return () => {
      removeModal(id)
    }
  }, [enabled, id])

  // Listen for Escape key
  useEffect(() => {
    if (!enabled) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleKeyDown])
}
