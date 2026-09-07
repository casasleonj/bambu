'use client'

import type { FocoCount, FocoKey } from './types'

function toneClass(tone: FocoCount['tone'], value: number): string {
  // Disciplina de color (blueprint §2.2): color solo si hay algo que hacer hoy.
  if (value === 0) return 'text-gray-700'
  if (tone === 'red') return 'text-red-600'
  if (tone === 'amber') return 'text-amber-600'
  return 'text-gray-800'
}

const money = (n: number) => new Intl.NumberFormat('es-CO').format(n)

/**
 * Cabecera de focos del Pedido Hub. Cada foco es un **filtro de un clic**
 * sobre la misma lista (blueprint §2.2). Capa de priorización, no
 * clasificación: una operación puede estar en varios focos.
 */
export function FocoStrip({
  focos,
  activeFoco,
  onSelect,
}: {
  focos: FocoCount[]
  activeFoco: FocoKey | null
  onSelect: (key: FocoKey | null) => void
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      data-testid="foco-strip"
      role="group"
      aria-label="Focos del día"
    >
      {focos.map((f) => {
        const active = activeFoco === f.key
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : f.key)}
            data-testid={`foco-${f.key}`}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
              active
                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className="block text-xs text-gray-500">{f.label}</span>
            <span
              data-testid={`foco-${f.key}-value`}
              className={`block text-lg font-bold ${toneClass(f.tone, f.value)}`}
            >
              {f.value}
              {f.amount != null && (
                <span className="ml-1 text-sm font-medium">· ${money(f.amount)}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
