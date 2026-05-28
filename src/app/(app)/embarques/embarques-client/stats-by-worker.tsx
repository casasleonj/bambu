import { formatDuracion } from '@/lib/embarque-stats'

interface StatsPorTrabajador {
  trabajadorId: string
  nombre: string
  totalEmbarques: number
  duracionPromedioMin: number | null
  entregasPorHoraPromedio: number | null
  tasaEntrega: number
  tasaNoEntrega: number
  discrepanciaPct: number
  totalPedidos: number
  totalEntregados: number
}

interface StatsByWorkerProps {
  data: StatsPorTrabajador[]
}

function TasaBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${Math.min(value * 100, 100)}%` }}
      />
    </div>
  )
}

export function StatsByWorker({ data }: StatsByWorkerProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-gray-500">No hay datos de repartidores en este período</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-800">Rendimiento por Repartidor</h3>
        <p className="text-xs text-gray-500">Ordenado por tasa de entrega</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gray-600">Repartidor</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Embarques</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Duración Prom.</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Entregas/Hora</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Tasa Entrega</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">No Entrega</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Discrepancia</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t, i) => (
              <tr key={t.trabajadorId} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        i === 0
                          ? 'bg-yellow-100 text-yellow-800'
                          : i === 1
                            ? 'bg-gray-200 text-gray-600'
                            : i === 2
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="font-medium">{t.nombre}</span>
                  </div>
                </td>
                <td className="text-center px-3 py-2">{t.totalEmbarques}</td>
                <td className="text-center px-3 py-2">
                  {t.duracionPromedioMin ? formatDuracion(t.duracionPromedioMin) : '—'}
                </td>
                <td className="text-center px-3 py-2">
                  {t.entregasPorHoraPromedio?.toFixed(1) ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <TasaBar value={t.tasaEntrega} color="bg-green-500" />
                    <span className="text-xs font-medium w-10 text-right">
                      {(t.tasaEntrega * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="text-center px-3 py-2">
                  <span
                    className={`text-xs font-medium ${
                      t.tasaNoEntrega > 0.1 ? 'text-red-600' : 'text-gray-500'
                    }`}
                  >
                    {(t.tasaNoEntrega * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="text-center px-3 py-2">
                  <span
                    className={`text-xs font-medium ${
                      t.discrepanciaPct > 0.05 ? 'text-red-600' : 'text-gray-500'
                    }`}
                  >
                    {(t.discrepanciaPct * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
