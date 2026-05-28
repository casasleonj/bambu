import { formatDuracion } from '@/lib/embarque-stats'

interface TendenciaDiaria {
  fecha: string
  totalEmbarques: number
  duracionPromedioMin: number | null
  entregasPorHoraPromedio: number | null
  tasaEntrega: number
}

interface StatsTimelineProps {
  data: TendenciaDiaria[]
}

export function StatsTimeline({ data }: StatsTimelineProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-gray-500">No hay datos de tendencia en este período</p>
      </div>
    )
  }

  const maxDuracion = Math.max(
    ...data.map((d) => d.duracionPromedioMin ?? 0),
    1,
  )

  const maxEntregas = Math.max(
    ...data.map((d) => d.entregasPorHoraPromedio ?? 0),
    1,
  )

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-800">Tendencia Diaria</h3>
        <p className="text-xs text-gray-500">
          Duración promedio y entregas por hora por día
        </p>
      </div>

      <div className="space-y-2">
        {data.map((d) => {
          const duracionPct = d.duracionPromedioMin
            ? (d.duracionPromedioMin / maxDuracion) * 100
            : 0
          const entregasPct = d.entregasPorHoraPromedio
            ? (d.entregasPorHoraPromedio / maxEntregas) * 100
            : 0
          const fechaLabel = new Date(d.fecha + 'T12:00:00').toLocaleDateString(
            'es-ES',
            { weekday: 'short', day: 'numeric', month: 'short' },
          )

          return (
            <div key={d.fecha} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-20 text-right shrink-0">
                {fechaLabel}
              </span>

              <div className="flex-1 flex items-center gap-2">
                {/* Duración bar */}
                <div className="flex-1 flex items-center gap-1">
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-purple-400 transition-all"
                      style={{ width: `${duracionPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-12 shrink-0">
                    {d.duracionPromedioMin
                      ? formatDuracion(d.duracionPromedioMin)
                      : '—'}
                  </span>
                </div>

                {/* Entregas bar */}
                <div className="flex-1 flex items-center gap-1">
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-green-400 transition-all"
                      style={{ width: `${entregasPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-12 shrink-0">
                    {d.entregasPorHoraPromedio?.toFixed(1) ?? '—'} e/h
                  </span>
                </div>
              </div>

              {/* Tasa badge */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                  d.tasaEntrega >= 0.9
                    ? 'bg-green-100 text-green-800'
                    : d.tasaEntrega >= 0.7
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                }`}
              >
                {(d.tasaEntrega * 100).toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-6 mt-4 pt-3 border-t text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-purple-400" />
          <span>Duración promedio</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span>Entregas/hora</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-100 border border-green-300" />
          <span>Tasa de entrega</span>
        </div>
      </div>
    </div>
  )
}
