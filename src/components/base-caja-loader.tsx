'use client'

import { lazy, Suspense } from 'react'

const BaseCajaModal = lazy(() => import('./base-caja-modal'))

export function BaseCajaLoader() {
  return (
    <Suspense fallback={null}>
      <BaseCajaModal />
    </Suspense>
  )
}
