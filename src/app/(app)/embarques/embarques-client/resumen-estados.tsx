import { BADGES, FASES_ORDEN, LABELS, contarPorFase, toUIEstadoInput } from '@/lib/embarque-ui-estado'
import type { Embarque } from './types'

/**
 * Resumen del Command Center: cuenta de embarques por fase derivada.
 *
 * Es una vista de conjunto de solo lectura, calculada en cliente a partir de
 * la lista ya cargada (nunca se persiste). El filtrado por fase quedará en
 * un incremento posterior; acá solo se muestran los conteos.
 */
export function ResumenEstados({ embarques }: { embarques: Embarque[] }) {
  const conteo = contarPorFase(embarques.map((e) => toUIEstadoInput(e)))

  return (
    <div className="flex flex-wrap gap-2 mb-4" data-testid="resumen-estados">
      {FASES_ORDEN.map((fase) => (
        <span
          key={fase}
          className={`px-3 py-1.5 rounded-full text-sm font-medium ${BADGES[fase]}`}
        >
          {LABELS[fase]}: {conteo[fase]}
        </span>
      ))}
    </div>
  )
}
