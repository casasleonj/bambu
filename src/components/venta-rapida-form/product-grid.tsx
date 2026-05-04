'use client'

import { Input } from '@/components/ui/input'
import { PRODUCTO_INFO, getProductosForCanal } from '@/lib/prices'
import type { Tier } from './types'

interface ProductGridProps {
  canal: 'PUNTO' | 'DOMICILIO'
  cantidades: Record<string, number>
  handleCantidadChange: (id: string, value: string) => void
  increment: (id: string) => void
  decrement: (id: string) => void
  getPrecio: (codigo: string) => number
  getPrecioBase: (codigo: string) => number
  tablaPrecios: Record<string, Tier[]>
  preciosEditando: Record<string, boolean>
  setPreciosEditando: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  preciosManuales: Record<string, number>
  setPreciosManuales: React.Dispatch<React.SetStateAction<Record<string, number>>>
}

function formatTier(t: Tier): string {
  if (t.cantMax) return `${t.cantMin}-${t.cantMax}: $${t.precio.toLocaleString()}`
  return `${t.cantMin}+: $${t.precio.toLocaleString()}`
}

function getActiveTier(codigo: string, cant: number, tablaPrecios: Record<string, Tier[]>): Tier | undefined {
  const tiers = tablaPrecios[codigo]
  if (!tiers) return undefined
  return tiers.find(t => cant >= t.cantMin && (t.cantMax === null || cant <= t.cantMax))
}

export function ProductGrid({
  canal,
  cantidades,
  handleCantidadChange,
  increment,
  decrement,
  getPrecio,
  getPrecioBase,
  tablaPrecios,
  preciosEditando,
  setPreciosEditando,
  preciosManuales,
  setPreciosManuales,
}: ProductGridProps) {
  const productosActuales = getProductosForCanal(canal)

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-700 text-sm">Productos</h3>
      {productosActuales.map((prodId) => {
        const info = PRODUCTO_INFO[prodId]
        const cant = cantidades[prodId] || 0
        const precio = getPrecio(info.codigo)
        const tiers = tablaPrecios[info.codigo] || []
        const activeTier = getActiveTier(info.codigo, cant, tablaPrecios)
        return (
          <div key={prodId} className="border rounded-lg p-3 bg-white">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">{info.emoji}</span>
                <div>
                  <span className="font-medium text-sm">{info.nombre}</span>
                  <span className="text-xs text-gray-400 ml-1">({info.unidad})</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => decrement(prodId)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                  disabled={cant === 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>
                <Input
                  type="number"
                  min="0"
                  value={cant || ''}
                  onChange={(e) => handleCantidadChange(prodId, e.target.value)}
                  className="w-16 text-center p-1 h-8 text-sm"
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => increment(prodId)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-green-100 hover:bg-green-200 text-green-700 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>
            </div>
            {/* Price tiers */}
            {tiers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {tiers.map((t, i) => {
                  const isActive = activeTier?.cantMin === t.cantMin
                  return (
                    <span
                      key={i}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${
                        isActive
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {formatTier(t)}
                    </span>
                  )
                })}
              </div>
            )}
            {cant > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Precio unitario:</span>
                {preciosEditando[info.codigo] ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">$</span>
                    <input
                      type="number"
                      min="0"
                      autoFocus
                      defaultValue={precio}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        const base = getPrecioBase(info.codigo)
                        if (val !== base) {
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
                    <span className="font-semibold">${precio.toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => setPreciosEditando(prev => ({ ...prev, [info.codigo]: true }))}
                      className="text-gray-400 hover:text-green-600 transition p-0.5"
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
            {cant > 0 && (
              <div className="flex justify-between items-center text-sm font-bold text-gray-800 mt-0.5">
                <span>Subtotal:</span>
                <span>${(cant * precio).toLocaleString()}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
