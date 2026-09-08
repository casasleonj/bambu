import { Input } from '@/components/ui/input'
import { PRODUCTO_INFO } from '@/lib/prices'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { Tier } from './types'

export interface PedidoItemEditorItem {
  /** Clave interna del producto (id de `PRODUCTO_INFO`), no el `codigo` canónico. */
  prodId: string
  cantidad: number
  /** Precio efectivo (manual si existe, si no el resuelto/base) — ya calculado por el padre (`getPrecio`). */
  precio: number
  /** Precio de tabla/base, sin manual — usado como referencia tachada y como placeholder del input de precio manual. */
  precioBase: number
  precioManual?: number
  /** `'cliente' | 'base' | ...` — origen del precio resuelto por `/api/precios/resolver`. */
  precioOrigen?: string
  tiers: Tier[]
  precioBajoConfirmado: boolean
}

export interface PedidoItemEditorProps {
  items: PedidoItemEditorItem[]
  preciosLoading: boolean
  onIncrement: (prodId: string) => void
  onDecrement: (prodId: string) => void
  onCantidadChange: (prodId: string, value: string) => void
  onPrecioManualChange: (codigo: string, valor: number) => void
  onConfirmarPrecioBajo: (codigo: string) => void
  /** prefijo de los `data-testid` de cada control (`<prefix>-inc-<codigo>`, etc.). */
  testIdPrefix?: string
}

/**
 * PedidoItemEditor (ALS §5) — grid de productos: cantidad, precio efectivo,
 * override de precio manual (con confirmación si baja más del 50% del
 * precio base) y tiers de volumen visibles.
 *
 * Fase 3c del rediseño (docs/pedidos/00-plan-frontend-rediseno-integral.md):
 * tercera y última extracción planeada del monolito
 * `pedido-form-unified/index.tsx`, después de `PedidoPricingSummary` (3a) y
 * `PedidoContextPanel` (3b). Es la pieza de mayor riesgo del conjunto —
 * cada cambio de cantidad dispara `resolverPrecios` (debounce 400ms +
 * fetch a `/api/precios/resolver`) en el padre — por eso, igual que 3b, se
 * mantiene el patrón "lift state up": el debounce, el fetch y el estado de
 * precios (`cantidades`, `preciosResueltos`, `preciosManuales`,
 * `preciosLoading`, `precioBajoConfirmado`) se quedan enteros en el padre.
 * Este componente solo recibe una lista de items YA resueltos (`getPrecio`/
 * `getPrecioBase` ya evaluados) más callbacks — cero fetch, cero timers,
 * cero riesgo de alterar el timing del debounce existente.
 */
export function PedidoItemEditor({
  items,
  preciosLoading,
  onIncrement,
  onDecrement,
  onCantidadChange,
  onPrecioManualChange,
  onConfirmarPrecioBajo,
  testIdPrefix = 'item',
}: PedidoItemEditorProps) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold text-gray-700 text-sm mb-3">Productos</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map(({ prodId, cantidad: cant, precio, precioBase, precioManual, precioOrigen, tiers, precioBajoConfirmado }) => {
          const info = PRODUCTO_INFO[prodId]
          const Icon = getProductoIconConfig(info.codigo).Icon

          return (
            <div key={prodId} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon size={24} />
                  <span className="font-medium text-sm">{info.nombre}</span>
                </div>
                <div className="flex items-center gap-1">
                  {preciosLoading && (
                    <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                  )}
                  {precioManual !== undefined && precioManual > 0 ? (
                    <>
                      <span className="text-[9px] text-gray-400 line-through">${precioBase.toLocaleString()}</span>
                      <span className="text-xs font-bold text-amber-600">${precioManual.toLocaleString()}</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-500">${precio.toLocaleString()}</span>
                  )}
                  {precioOrigen === 'cliente' && (
                    <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Especial</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button type="button" data-testid={`${testIdPrefix}-dec-${info.codigo}`} onClick={() => onDecrement(prodId)} className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-gray-600" disabled={cant === 0}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                  </button>
                  <Input type="number" min="0" data-testid={`${testIdPrefix}-cant-${info.codigo}`} value={cant || ''} onChange={(e) => onCantidadChange(prodId, e.target.value)} className="w-14 text-center p-1 h-8 text-sm bg-white" placeholder="0" />
                  <button type="button" data-testid={`${testIdPrefix}-inc-${info.codigo}`} onClick={() => onIncrement(prodId)} className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
                {cant > 0 && <span className="text-sm font-bold">${(cant * precio).toLocaleString()}</span>}
              </div>
              {cant > 0 && (
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">Precio:</span>
                  <input
                    type="number"
                    min="0"
                    value={precioManual ?? ''}
                    onChange={(e) => onPrecioManualChange(info.codigo, parseFloat(e.target.value) || 0)}
                    placeholder={`${precioBase}`}
                    className="w-16 text-xs border border-gray-300 rounded px-1 py-0.5 text-right focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                  />
                  {precioManual !== undefined && precioManual > 0 && (
                    <button
                      type="button"
                      onClick={() => onPrecioManualChange(info.codigo, 0)}
                      className="text-[10px] text-gray-400 hover:text-red-500"
                      title="Restaurar precio base"
                    >
                      ↺
                    </button>
                  )}
                </div>
              )}
              {cant > 0 && precioManual !== undefined &&
                precioManual > 0 &&
                precioManual < precioBase * 0.5 &&
                !precioBajoConfirmado && (
                <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-[10px] text-amber-700 flex items-center justify-between">
                  <span>⚠️ {Math.round((1 - precioManual / precioBase) * 100)}% bajo</span>
                  <button
                    type="button"
                    onClick={() => onConfirmarPrecioBajo(info.codigo)}
                    className="text-amber-800 font-medium underline"
                  >
                    Confirmar
                  </button>
                </div>
              )}
              {tiers.length > 0 && cant > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tiers.map((t, i) => (
                    <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${cant >= t.cantMin && (t.cantMax === null || cant <= t.cantMax) ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                      {t.cantMax ? `${t.cantMin}-${t.cantMax}` : `${t.cantMin}+`}: ${t.precio.toLocaleString()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
