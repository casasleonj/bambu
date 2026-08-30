import { BADGES, LABELS, type FaseUIEmbarque } from '@/lib/embarque-ui-estado'
import type { Embarque } from '../types'
import { CommandCard } from './command-card'

/**
 * Una sección del Command Center: encabezado de fase + tarjetas.
 *
 * Un solo árbol de DOM: en desktop el contenedor padre la coloca como columna
 * (`lg:grid-cols-3`), en mobile queda apilada. NO se renderizan vistas
 * desktop/mobile separadas — eso duplicaría los `data-testid="embarque-card"`
 * (anti-patrón AGENTS.md #24).
 */
export function FaseSection({
  fase,
  embarques,
}: {
  fase: FaseUIEmbarque
  embarques: Embarque[]
}) {
  if (embarques.length === 0) return null

  return (
    <section className="flex flex-col gap-3" data-testid={`fase-section-${fase}`}>
      <div className="flex items-center gap-2 pb-1 border-b sticky top-0 bg-gray-50 z-10 lg:static">
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${BADGES[fase]}`}>
          {LABELS[fase]}
        </span>
        <span className="text-sm text-gray-400 font-medium">{embarques.length}</span>
      </div>
      {embarques.map((e) => <CommandCard key={e.id} embarque={e} />)}
    </section>
  )
}
