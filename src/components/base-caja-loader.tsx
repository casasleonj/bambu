'use client'

import dynamic from 'next/dynamic'

const BaseCajaModal = dynamic(() => import('./base-caja-modal'), { ssr: false })

export function BaseCajaLoader() {
  return <BaseCajaModal />
}

/**
 * Opens the base-caja modal from anywhere in the client.
 * Optional initial value pre-fills the input.
 */
export function openBaseCajaModal(initialValue?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('open-base-caja-modal', { detail: initialValue }))
}
