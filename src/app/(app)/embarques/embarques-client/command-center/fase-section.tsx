'use client'

import { useState } from 'react'
import { BADGES, LABELS, type FaseUIEmbarque } from '@/lib/embarque-ui-estado'
import type { Embarque } from '../types'
import { CommandCard } from './command-card'

/**
 * Una sección del Command Center: encabezado de fase + tarjetas.
 * Desktop → columna; mobile → sección colapsable con encabezado sticky.
 */
export function FaseSection({
  fase,
  embarques,
  variant,
}: {
  fase: FaseUIEmbarque
  embarques: Embarque[]
  variant: 'desktop' | 'mobile'
}) {
  const [colapsada, setColapsada] = useState(false)

  if (embarques.length === 0) return null

  const header = (
    <div className="flex items-center gap-2">
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${BADGES[fase]}`}>
        {LABELS[fase]}
      </span>
      <span className="text-sm text-gray-400 font-medium">{embarques.length}</span>
    </div>
  )

  if (variant === 'mobile') {
    return (
      <section data-testid={`fase-section-${fase}`}>
        <button
          onClick={() => setColapsada((v) => !v)}
          className="w-full flex items-center justify-between py-2 sticky top-0 bg-gray-50 z-10"
          aria-expanded={!colapsada}
        >
          {header}
          <span className="text-gray-400 text-xs">{colapsada ? '▸' : '▾'}</span>
        </button>
        {!colapsada && (
          <div className="space-y-3 pb-2">
            {embarques.map((e) => <CommandCard key={e.id} embarque={e} />)}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3" data-testid={`fase-section-${fase}`}>
      <div className="pb-1 border-b">{header}</div>
      {embarques.map((e) => <CommandCard key={e.id} embarque={e} />)}
    </section>
  )
}
