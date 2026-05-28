import { formatDuracion } from '@/lib/embarque-stats'

interface KpiGeneral {
  totalEmbarques: number
  duracionPromedioMin: number | null
  duracionMedianaMin: number | null
  duracionMinMin: number | null
  duracionMaxMin: number | null
  entregasPorHoraPromedio: number | null
  tasaEntregaPromedio: number
  tasaNoEntregaPromedio: number
  tiempoPreparacionPromedioMin: number | null
  discrepanciaPromedioPct: number
  totalPedidos: number
  totalEntregados: number
  totalNoEntregados: number
}

interface StatsKpiCardsProps {
  kpi: KpiGeneral
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
  color = 'blue',
}: {
  icon: string
  label: string
  value: string
  sublabel?: string
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    amber: 'bg-amber-50 border-amber-200',
    red: 'bg-red-50 border-red-200',
    purple: 'bg-purple-50 border-purple-200',
  }

  return (
    <div
      className={`rounded-xl border p-4 ${colors[color]}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sublabel && (
        <p className="text-xs text-gray-500 mt-1">{sublabel}</p>
      )}
    </div>
  )
}

export function StatsKpiCards({ kpi }: StatsKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        icon="📦"
        label="Embarques"
        value={String(kpi.totalEmbarques)}
        sublabel="cerrados en el período"
        color="blue"
      />
      <KpiCard
        icon="⏱"
        label="Duración Prom."
        value={kpi.duracionPromedioMin ? formatDuracion(kpi.duracionPromedioMin) : '—'}
        sublabel={
          kpi.duracionMedianaMin
            ? `Mediana: ${formatDuracion(Math.round(kpi.duracionMedianaMin))}`
            : undefined
        }
        color="purple"
      />
      <KpiCard
        icon="🚚"
        label="Entregas/Hora"
        value={kpi.entregasPorHoraPromedio?.toFixed(1) ?? '—'}
        sublabel="promedio por embarque"
        color="green"
      />
      <KpiCard
        icon="✅"
        label="Tasa Entrega"
        value={`${(kpi.tasaEntregaPromedio * 100).toFixed(1)}%`}
        sublabel={`${kpi.totalEntregados} de ${kpi.totalPedidos}`}
        color="green"
      />
      <KpiCard
        icon="🏭"
        label="Preparación"
        value={kpi.tiempoPreparacionPromedioMin ? formatDuracion(kpi.tiempoPreparacionPromedioMin) : '—'}
        sublabel="promedio (creación → salida)"
        color="amber"
      />
      <KpiCard
        icon="⚠️"
        label="Discrepancia"
        value={`${(kpi.discrepanciaPromedioPct * 100).toFixed(1)}%`}
        sublabel="piezas no contabilizadas"
        color={kpi.discrepanciaPromedioPct > 0.05 ? 'red' : 'amber'}
      />
    </div>
  )
}
