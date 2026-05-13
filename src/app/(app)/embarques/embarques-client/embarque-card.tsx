import type { Embarque, Pedido } from './types'

function ClosedPedidosSummary({ pedidos }: { pedidos: Pedido[] }) {
  const normales = pedidos.filter((p) => p.origen !== 'VENTA_LIBRE')
  const libres = pedidos.filter((p) => p.origen === 'VENTA_LIBRE')

  const parts: string[] = []
  if (normales.length > 0) parts.push(`${normales.length} entregados`)
  if (libres.length > 0) parts.push(`${libres.length} libres`)

  return <p>{pedidos.length} pedidos{parts.length > 0 ? ` (${parts.join(', ')})` : ''}</p>
}

export function EmbarqueCard({
  embarque,
  getEstadoBadge,
  onClick,
}: {
  embarque: Embarque
  getEstadoBadge: (estado: string) => React.ReactNode
  onClick: () => void
}) {
  const cap = embarque.capacidadInfo

  return (
    <div
      className="bg-white p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer border"
      onClick={onClick}
      data-testid="embarque-card"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-lg font-bold text-gray-800">#{embarque.numero}</p>
          <p className="text-sm text-gray-500">{embarque.trabajador.nombre}</p>
          {embarque.ruta && (
            <p className="text-xs text-blue-600 font-medium">{embarque.ruta.nombre}</p>
          )}
        </div>
        {getEstadoBadge(embarque.estado)}
      </div>

      {cap && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-3 ${cap.color}`}>
          <span className="text-lg">{cap.icon}</span>
          <div>
            <p className="text-sm font-medium">{cap.label}</p>
            <p className="text-xs">{cap.total} pacas · {cap.pesoKg.toFixed(1)}kg / {cap.capacidadKg}kg</p>
          </div>
        </div>
      )}

      <div className="text-sm text-gray-600">
        {embarque.estado === 'CERRADO' ? (
          <ClosedPedidosSummary pedidos={embarque.pedidos || []} />
        ) : (
          <p>{embarque.pedidos?.length || 0} pedidos asignados</p>
        )}
        {embarque.horaSalida && (
          <p>Salida: {new Date(embarque.horaSalida).toLocaleTimeString()}</p>
        )}
      </div>
      {embarque.obs && (
        <p className="mt-2 text-xs text-gray-500 truncate">{embarque.obs}</p>
      )}
    </div>
  )
}
