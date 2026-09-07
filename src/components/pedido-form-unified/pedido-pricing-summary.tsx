import { getProductoIconConfig } from '@/lib/producto-iconos'
import { PRODUCTO_INFO } from '@/lib/prices'

export interface PedidoPricingSummaryLinea {
  /** Clave interna del producto (id de `PRODUCTO_INFO`), no el `codigo` canónico. */
  prodId: string
  cantidad: number
  precio: number
}

export interface PedidoPricingSummaryProps {
  lineas: PedidoPricingSummaryLinea[]
  total: number
  totalPagado: number
  saldoPendiente: number
}

/**
 * PedidoPricingSummary (ALS §5) — resumen de cálculo del pedido en curso.
 *
 * Puramente presentacional: no tiene estado propio, no hace fetch, no
 * decide precios — solo renderiza lo que `PedidoFormUnified` ya calculó.
 * Backend authority (ALS A1) sigue intacta: este componente no cambia qué
 * se cobra, solo cómo se muestra.
 *
 * Primera extracción de Fase 3 (docs/pedidos/00-plan-frontend-rediseno-integral.md)
 * del monolito `pedido-form-unified/index.tsx` (1334 líneas) — se eligió esta
 * pieza primero por ser la de menor riesgo: sin debounce, sin refs, sin
 * efectos async, a diferencia del panel de cliente o el editor de items.
 */
export function PedidoPricingSummary({ lineas, total, totalPagado, saldoPendiente }: PedidoPricingSummaryProps) {
  const lineasConCantidad = lineas.filter(l => l.cantidad > 0)

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <h3 className="font-semibold text-gray-700 text-sm mb-3">🧾 Resumen</h3>
      <div className="space-y-1.5 mb-3">
        {lineasConCantidad.map(({ prodId, cantidad, precio }) => {
          const info = PRODUCTO_INFO[prodId]
          const Icon = getProductoIconConfig(info.codigo).Icon
          return (
            <div key={prodId} className="flex justify-between text-sm">
              <span className="text-gray-600"><Icon size={16} className="inline-block align-text-bottom" /> {cantidad} x {info.nombre}</span>
              <span className="font-medium">${(cantidad * precio).toLocaleString()}</span>
            </div>
          )
        })}
        {lineasConCantidad.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">Sin productos seleccionados</p>
        )}
      </div>
      <div className="border-t pt-2 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total:</span>
          <span className="font-bold text-lg">${total.toLocaleString()}</span>
        </div>
        {totalPagado > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Pagado:</span>
            <span className="font-medium text-green-600">${totalPagado.toLocaleString()}</span>
          </div>
        )}
        {saldoPendiente > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Saldo:</span>
            <span className="font-medium text-red-600">${saldoPendiente.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
