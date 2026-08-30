import { derivarEstadoUI, toUIEstadoInput } from '@/lib/embarque-ui-estado'
import type { Embarque } from '../types'
import { tieneAlerta } from './activity'

/**
 * Fila de KPIs del Command Center — derivada de la lista ya cargada
 * (sin fetch extra). Solo lectura.
 */
export function KpiRow({ embarques }: { embarques: Embarque[] }) {
  const total = embarques.length
  const enRuta = embarques.filter((e) => derivarEstadoUI(toUIEstadoInput(e)).fase === 'EN_RUTA').length
  const cerrados = embarques.filter((e) => derivarEstadoUI(toUIEstadoInput(e)).fase === 'CERRADO').length
  const conAlerta = embarques.filter(tieneAlerta).length

  const kpis: Array<{ label: string; value: number; tone: string; testId: string }> = [
    { label: 'Embarques', value: total, tone: 'text-gray-800', testId: 'kpi-total' },
    { label: 'En ruta', value: enRuta, tone: 'text-blue-600', testId: 'kpi-en-ruta' },
    { label: 'Cerrados', value: cerrados, tone: 'text-gray-600', testId: 'kpi-cerrados' },
    { label: 'Con incidencia', value: conAlerta, tone: 'text-amber-600', testId: 'kpi-alerta' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" data-testid="command-center-kpis">
      {kpis.map((k) => (
        <div key={k.testId} className="bg-white p-3 rounded-xl shadow" data-testid={k.testId}>
          <p className="text-xs text-gray-500">{k.label}</p>
          <p className={`text-xl font-bold ${k.tone}`}>{k.value}</p>
        </div>
      ))}
    </div>
  )
}
