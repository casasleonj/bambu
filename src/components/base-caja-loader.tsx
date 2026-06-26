'use client'

import dynamic from 'next/dynamic'

const BaseCajaModal = dynamic(() => import('./base-caja-modal'), { ssr: false })

export function BaseCajaLoader() {
  return <BaseCajaModal />
}

/**
 * Opens the base-caja modal from anywhere in the client.
 * Optional initial value pre-fills the input.
 *
 * Uses both a CustomEvent and a global flag so the dynamically imported
 * modal can recover the request even if it mounts after the event fires.
 */
export function openBaseCajaModal(initialValue?: string) {
  if (typeof window === 'undefined') return

  if ('__OPEN_BASE_CAJA_MODAL_VALUE' in window === false) {
    Object.defineProperty(window, '__OPEN_BASE_CAJA_MODAL_VALUE', {
      value: initialValue,
      writable: true,
      configurable: true,
    })
  } else {
    ;(window as unknown as { __OPEN_BASE_CAJA_MODAL_VALUE: string | undefined }).__OPEN_BASE_CAJA_MODAL_VALUE =
      initialValue
  }

  window.dispatchEvent(new CustomEvent('open-base-caja-modal', { detail: initialValue }))
}
