'use client'

import { Input } from '@/components/ui/input'
import { PRODUCTO_INFO, type ProductoId } from '@/lib/prices'
import type { Tier } from './types'

interface ProductosSectionProps {
  productos: Record<ProductoId, number>
  preciosResueltos: Record<string, number>
  preciosManuales: Record<string, number>
  setPreciosManuales: React.Dispatch<React.SetStateAction<Record<string, number>>>
  preciosEditando: Record<string, boolean>
  setPreciosEditando: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  tablaPrecios: Record<string, Tier[]>
  precios: Record<string, number>
  onCantidadChange: (productoId: ProductoId, value: string) => void
  total: number
  getPrecio: (productoId: ProductoId) => number
  getEffectivePrice: (codigo: string) => number
  formatTier: (t: Tier) => string
  getActiveTier: (codigo: string, cant: number) => Tier | undefined
  productosVisibles: ProductoId[]
}

export function ProductosSection({
  productos,
  preciosResueltos,
  preciosManuales,
  setPreciosManuales,
  preciosEditando,
  setPreciosEditando,
  tablaPrecios,
  precios,
  onCantidadChange,
  total,
  getPrecio,
  getEffectivePrice,
  formatTier,
  getActiveTier,
  productosVisibles,
}: ProductosSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-700 text-sm">Productos</h3>
      {productosVisibles.map((prodId) => {
        const info = PRODUCTO_INFO[prodId]
        const precioBase = getPrecio(prodId)
        const precioActual = getEffectivePrice(info.codigo)
        const estaEditando = preciosEditando[info.codigo]
        const cantidad = productos[prodId] || 0
        const tiers = tablaPrecios[info.codigo] || []
        const activeTier = getActiveTier(info.codigo, cantidad)
        return (
          <div key={prodId} className="border rounded-lg p-3 bg-white">
            {/* Header: info + controls */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">{info.emoji}</span>
                <div>
                  <span className="font-medium text-sm">{info.nombre}</span>
                  <span className="text-xs text-gray-400 ml-1">({info.unidad})</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onCantidadChange(prodId, String(Math.max(0, cantidad - 1)))}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                  disabled={cantidad <= 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>
                <Input
                  type="number"
                  min="0"
                  value={cantidad || ''}
                  onChange={(e) => onCantidadChange(prodId, e.target.value)}
                  className="w-16 text-center p-1 h-8 text-sm"
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => onCantidadChange(prodId, String(cantidad + 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>
            </div>
            {/* Tiers */}
            {tiers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {tiers.map((t, i) => {
                  const isActive = activeTier?.cantMin === t.cantMin
                  return (
                    <span
                      key={i}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {formatTier(t)}
                    </span>
                  )
                })}
              </div>
            )}
            {/* Precio editable + subtotal */}
            {cantidad > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Precio unitario:</span>
                {estaEditando ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">$</span>
                    <input
                      type="number"
                      min="0"
                      autoFocus
                      defaultValue={precioActual}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        if (val !== precioBase) {
                          setPreciosManuales(prev => ({ ...prev, [info.codigo]: val }))
                        } else {
                          setPreciosManuales(prev => {
                            const next = { ...prev }
                            delete next[info.codigo]
                            return next
                          })
                        }
                        setPreciosEditando(prev => ({ ...prev, [info.codigo]: false }))
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur()
                        }
                      }}
                      className="w-20 border rounded px-2 py-1 text-sm text-right"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">${precioActual.toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => setPreciosEditando(prev => ({ ...prev, [info.codigo]: true }))}
                      className="text-gray-400 hover:text-blue-600 transition p-0.5"
                      title="Editar precio"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
            {cantidad > 0 && (
              <div className="flex justify-between items-center text-sm font-bold text-gray-800 mt-0.5">
                <span>Subtotal:</span>
                <span>${(cantidad * precioActual).toLocaleString()}</span>
              </div>
            )}
          </div>
        )
      })}

      <div className="flex justify-between items-center pt-3 border-t">
        <span className="font-medium">Total Pedido:</span>
        <span className="text-xl font-bold">${total.toLocaleString()}</span>
      </div>
    </div>
  )
}
