import { formatDuracion } from '@/lib/embarque-stats'

interface StatsPorRuta {
  rutaId: string | null
  nombre: string | null
  totalEmbarques: number
  duracionPromedioMin: number | null
  entregasPorHoraPromedio: number | null
  tasaEntrega: number
  tasaNoEntrega: number
  totalPedidos: number
  totalEntregados: number
}

interface StatsByRouteProps {
  data: StatsPorRuta[]
}

export function StatsByRoute({ data }: StatsByRouteProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-gray-500">No hay datos de rutas en este período</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-800">Rendimiento por Ruta</h3>
        <p className="text-xs text-gray-500">Ordenado por tasa de entrega</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gray-600">Ruta</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Embarques</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Duración Prom.</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Entregas/Hora</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Tasa Entrega</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Total Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.rutaId ?? 'sin-ruta'} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">
                  <span className="font-medium">
                    {r.nombre ?? 'Sin ruta'}
                  </span>
                </td>
                <td className="text-center px-3 py-2">{r.totalEmbarques}</td>
                <td className="text-center px-3 py-2">
                  {r.duracionPromedioMin ? formatDuracion(r.duracionPromedioMin) : '—'}
                </td>
                <td className="text-center px-3 py-2">
                  {r.entregasPorHoraPromedio?.toFixed(1) ?? '—'}
                </td>
                <td className="text-center px-3 py-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.tasaEntrega >= 0.9
                        ? 'bg-green-100 text-green-800'
                        : r.tasaEntrega >= 0.7
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {(r.tasaEntrega * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="text-center px-3 py-2">{r.totalPedidos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
