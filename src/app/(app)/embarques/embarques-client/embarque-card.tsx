import type { Embarque, Pedido } from './types'

function getDeficitBadge(embarque: Embarque): React.ReactNode {
  if (!embarque.stockSnapshot) return null
  try {
    const snapshot = typeof embarque.stockSnapshot === 'string'
      ? JSON.parse(embarque.stockSnapshot)
      : embarque.stockSnapshot
    if (snapshot.overrideRequerido) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium mb-3 w-fit">
          <span>⚠️</span>
          <span>Déficit: {snapshot.totalDeficit} u.</span>
        </div>
      )
    }
  } catch {}
  return null
}

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
          <p className="text-lg font-bold text-gray-800">#{embarque.numeroDia}</p>
          <p className="text-sm text-gray-500">{embarque.trabajador.nombre}</p>
          {embarque.ruta && (
            <p className="text-xs text-blue-600 font-medium">{embarque.ruta.nombre}</p>
          )}
          {embarque.tipoMoto && (
            <p className="text-xs text-gray-400">{embarque.tipoMoto}</p>
          )}
        </div>
        {getEstadoBadge(embarque.estado)}
      </div>

      {cap && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-3 ${cap.color}`}>
          <span className="text-lg">{cap.icon}</span>
          <div>
            <p className="text-sm font-medium">{cap.label}</p>
            <p className="text-xs">{cap.total} u. · {cap.pesoKg.toFixed(1)}kg / {cap.capacidadKg}kg</p>
          </div>
        </div>
      )}

      {getDeficitBadge(embarque)}

      <div className="text-sm text-gray-600">
        {embarque.estado === 'CERRADO' ? (
          <ClosedPedidosSummary pedidos={embarque.pedidos || []} />
        ) : (
          <p>{embarque.pedidos?.length || 0} pedidos asignados</p>
        )}
        {embarque.horaSalida && (
          <p>Salida: {new Date(embarque.horaSalida).toLocaleTimeString()}</p>
        )}
        {embarque.baseDinero > 0 && (
          <p className="text-xs text-amber-600">Base: ${embarque.baseDinero.toLocaleString()}</p>
        )}
      </div>
      {embarque.obs && (
        <p className="mt-2 text-xs text-gray-500 truncate">{embarque.obs}</p>
      )}
    </div>
  )
}
