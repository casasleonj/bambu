'use client'

import dynamic from 'next/dynamic'

const BaseCajaModal = dynamic(() => import('./base-caja-modal'), { ssr: false })

export function BaseCajaLoader() {
  return <BaseCajaModal />
}
