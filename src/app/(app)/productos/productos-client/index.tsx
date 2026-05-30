'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { Modal } from '@/components/modal'
import type { PrecioVolumen, PreciosClientProps } from './types'
import { formatCOP, tierLabel } from './types'

/** Extrae el primer mensaje de error de fieldErrors (Record<string, string[]>) */
function firstFieldError(fieldErrors?: Record<string, string[]>): string | undefined {
  if (!fieldErrors) return undefined
  const entries = Object.entries(fieldErrors)
  for (const [, messages] of entries) {
    if (messages.length > 0) return messages[0]
  }
  return undefined
}

/** Construye un mensaje de error legible desde la respuesta del API */
function extractErrorMessage(data: { error?: { message?: string; formErrors?: string[]; fieldErrors?: Record<string, string[]> } }, fallback: string): string {
  return data.error?.message
    || data.error?.formErrors?.[0]
    || firstFieldError(data.error?.fieldErrors)
    || fallback
}

/** Calcula huecos (gaps) entre rangos ordenados. Retorna array de {desde, hasta} */
function calculateGaps(tiers: { cantMin: number; cantMax: number | null }[]): { desde: number; hasta: number }[] {
  if (tiers.length === 0) return []
  const sorted = [...tiers].sort((a, b) => a.cantMin - b.cantMin)
  const gaps: { desde: number; hasta: number }[] = []

  // Gap antes del primer tier (si cantMin > 1)
  if (sorted[0].cantMin > 1) {
    gaps.push({ desde: 1, hasta: sorted[0].cantMin - 1 })
  }

  // Gaps entre tiers
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]
    const next = sorted[i + 1]
    if (current.cantMax !== null && current.cantMax + 1 < next.cantMin) {
      gaps.push({ desde: current.cantMax + 1, hasta: next.cantMin - 1 })
    }
  }

  return gaps
}

/** Valida si un cantMin ya existe en los tiers del producto */
function cantMinExists(tiers: PrecioVolumen[], cantMin: number): boolean {
  return tiers.some(t => t.cantMin === cantMin)
}

export default function ProductosClient({ productos: initialProductos }: PreciosClientProps) {
  const { confirm, modal } = useConfirm()
  const [productos, setProductos] = useState(initialProductos)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalProductoId, setModalProductoId] = useState<string | null>(null)
  const [modalCantMin, setModalCantMin] = useState('')
  const [modalCantMax, setModalCantMax] = useState('')
  const [modalPrecio, setModalPrecio] = useState('')

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyProducto, setHistoryProducto] = useState<string>('')
  const [historyData, setHistoryData] = useState<Array<{ id: string; producto: string; precio: number; vigenteDesde: string; creadoPor: string }>>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Modal de impacto de precios
  const [impactoOpen, setImpactoOpen] = useState(false)
  const [impactoLoading, setImpactoLoading] = useState(false)
  const [impactoData, setImpactoData] = useState<{
    productoNombre: string
    productoCodigo: string
    precioActual: number
    precioNuevo: number
    cambioPorcentaje: number
    clientesAfectados: Array<{ id: string; nombre: string; precioEspecial: number; desviacion: number }>
    pedidosPendientes: number
    rangosExistentes: Array<{ cantMin: number; cantMax: number | null; precio: number }>
  } | null>(null)
  const impactoConfirmCallback = useRef<(() => Promise<void>) | null>(null)

  function startEdit(precio: PrecioVolumen) {
    const currentPrice = Number(precio.precio)
    setEditingId(precio.id)
    setEditValue(String(currentPrice))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
  }

  async function savePrice(precioId: string) {
    const newPrice = parseFloat(editValue)
    if (isNaN(newPrice) || newPrice <= 0) {
      toast.error('Ingrese un precio valido mayor a 0')
      return
    }

    // Buscar el producto que contiene este precio
    const producto = productos.find(p => p.precios.some(pr => pr.id === precioId))
    if (!producto) {
      toast.error('Producto no encontrado')
      return
    }

    // Verificar impacto antes de guardar
    setImpactoLoading(true)
    try {
      const res = await fetch(`/api/precios/impacto?productoId=${producto.id}&precioNuevo=${newPrice}`)
      if (res.ok) {
        const result = await res.json()
        if (result.impacto) {
          setImpactoData(result.impacto)
          setImpactoOpen(true)
          impactoConfirmCallback.current = async () => {
            await doSavePrice(precioId, newPrice)
          }
          return
        }
      }
    } catch (error) {
      console.error('Error fetching impact:', error)
    } finally {
      setImpactoLoading(false)
    }

    // Si no hay impacto o error, guardar directamente
    await doSavePrice(precioId, newPrice)
  }

  async function doSavePrice(precioId: string, newPrice: number) {
    setSaving(true)
    try {
      const res = await fetch('/api/precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precioVolumenId: precioId, precio: newPrice }),
      })
      if (res.ok) {
        toast.success('Precio actualizado')
        setProductos(prev => prev.map(p => ({
          ...p,
          precios: p.precios.map(pr => pr.id === precioId ? { ...pr, precio: newPrice } : pr)
        })))
        cancelEdit()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(extractErrorMessage(data, 'Error actualizando precio'))
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTier(precio: PrecioVolumen) {
    const label = precio.cantMax === null ? `${precio.cantMin}+` : `${precio.cantMin}-${precio.cantMax}`
    const ok = await confirm(
      `¿Eliminar el rango ${label}? Los pedidos existentes mantendran su precio actual.`
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/precios/${precio.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Rango eliminado')
        setProductos(prev => prev.map(p => ({
          ...p,
          precios: p.precios.filter(pr => pr.id !== precio.id)
        })))
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(extractErrorMessage(data, 'Error eliminando rango'))
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  async function addTier() {
    if (!modalProductoId || !modalCantMin || !modalPrecio) {
      toast.error('Complete cantidad mínima y precio')
      return
    }
    const cantMin = parseInt(modalCantMin)
    const cantMax = modalCantMax ? parseInt(modalCantMax) : null
    const precio = parseFloat(modalPrecio)
    if (isNaN(cantMin) || cantMin < 1 || isNaN(precio) || precio <= 0) {
      toast.error('Valores inválidos')
      return
    }

    // Validación cliente: cantMin duplicado
    const producto = productos.find(p => p.id === modalProductoId)
    if (producto && cantMinExists(producto.precios, cantMin)) {
      toast.error(`Ya existe un rango que empieza en ${cantMin} para este producto. Usa un valor diferente o edita el rango existente.`)
      return
    }

    // Validación cliente: cantMax < cantMin
    if (cantMax !== null && cantMax < cantMin) {
      toast.error('La cantidad máxima debe ser mayor o igual a la cantidad mínima')
      return
    }

    try {
      const res = await fetch('/api/precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoId: modalProductoId, cantMin, cantMax, precio }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success('Rango agregado')
        setProductos(prev => prev.map(p => p.id === modalProductoId ? {
          ...p,
          precios: [...p.precios, data.tier]
        } : p))
        setModalOpen(false)
        setModalProductoId(null)
        setModalCantMin('')
        setModalCantMax('')
        setModalPrecio('')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(extractErrorMessage(data, 'Error agregando rango'))
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  async function openHistory(productoCodigo: string) {
    setHistoryProducto(productoCodigo)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/precios/historial?producto=${encodeURIComponent(productoCodigo)}`)
      if (res.ok) {
        const data = await res.json()
        setHistoryData(data.historial || [])
      }
    } catch {
      toast.error('Error cargando historial')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function updateProductoConfig(productoId: string, data: { aplicaDomicilio?: boolean; sobreCostoDomicilio?: number; precioBase?: number }) {
    // Si se cambia precioBase, verificar impacto antes de guardar
    if (data.precioBase !== undefined) {
      setImpactoLoading(true)
      try {
        const res = await fetch(`/api/precios/impacto?productoId=${productoId}&precioNuevo=${data.precioBase}`)
        if (res.ok) {
          const result = await res.json()
          if (result.impacto) {
            setImpactoData(result.impacto)
            setImpactoOpen(true)
            impactoConfirmCallback.current = async () => {
              await doUpdateProductoConfig(productoId, data)
            }
            return
          }
        }
      } catch (error) {
        console.error('Error fetching impact:', error)
      } finally {
        setImpactoLoading(false)
      }
    }

    // Si no es precioBase o no hay impacto, guardar directamente
    await doUpdateProductoConfig(productoId, data)
  }

  async function doUpdateProductoConfig(productoId: string, data: { aplicaDomicilio?: boolean; sobreCostoDomicilio?: number; precioBase?: number }) {
    try {
      const res = await fetch('/api/productos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoId, ...data }),
      })
      if (res.ok) {
        toast.success('Configuración actualizada')
        setProductos(prev => prev.map(p => p.id === productoId ? {
          ...p,
          ...data,
        } : p))
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(extractErrorMessage(data, 'Error actualizando configuración'))
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestiona productos y sus precios por volumen</p>
      </div>

      {productos.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          title="No hay productos configurados"
          description="Agrega productos para definir sus precios por volumen"
        />
      ) : (
        <div className="space-y-4">
          {productos.map((producto) => (
            <Card key={producto.id} data-testid={`producto-card-${producto.codigo}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {producto.nombre}
                      {producto.contenido && (
                        <span className="text-muted-foreground text-sm font-normal ml-2">({producto.contenido})</span>
                      )}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" data-testid={`history-btn-${producto.id}`} onClick={() => openHistory(producto.codigo)}>
                      📋 Historial
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`add-range-btn-${producto.id}`} onClick={() => { setModalProductoId(producto.id); setModalOpen(true) }}>
                      + Agregar rango
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid={`domicilio-toggle-${producto.id}`}
                      checked={producto.aplicaDomicilio}
                      onChange={(e) => updateProductoConfig(producto.id, { aplicaDomicilio: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    Aplica para domicilio
                  </label>
                  {producto.aplicaDomicilio && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Sobrecosto domicilio:</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          type="number"
                          min="0"
                          data-testid={`sobrecosto-input-${producto.id}`}
                          defaultValue={Number(producto.sobreCostoDomicilio)}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value)
                            if (!isNaN(val) && val >= 0) {
                              updateProductoConfig(producto.id, { sobreCostoDomicilio: val })
                            }
                          }}
                          className="w-28 text-right h-8 text-sm pl-6"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground" title="Se usa cuando la cantidad no entra en ningún rango de volumen">
                      Precio base:
                      <svg className="w-3.5 h-3.5 inline ml-0.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </span>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          type="number"
                          min="0"
                          data-testid={`precio-base-input-${producto.id}`}
                          defaultValue={Number(producto.precioBase)}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value)
                            if (!isNaN(val) && val >= 0) {
                              updateProductoConfig(producto.id, { precioBase: val })
                            }
                          }}
                          className="w-28 text-right h-8 text-sm pl-6"
                        />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {producto.precios.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin rangos de volumen configurados</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Cantidad mínima</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Cantidad máxima</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">Precio</th>
                          <th className="w-[100px] py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {producto.precios.map((precio) => (
                          <tr key={precio.id} className="border-b last:border-b-0 hover:bg-muted/50" data-precio-id={precio.id}>
                            <td className="py-2.5 px-3">{precio.cantMin}</td>
                            <td className="py-2.5 px-3 text-muted-foreground">{precio.cantMax ?? '—'}</td>
                            <td className="py-2.5 px-3 text-right">
                              {editingId === precio.id ? (
                                <div className="flex items-center gap-1 justify-end" data-testid={`price-edit-row-${precio.id}`} data-precio-id={precio.id}>
                                  <Input
                                    type="number"
                                    min="0"
                                    data-testid={`price-input-${precio.id}`}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="w-28 text-right h-8 text-sm"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') savePrice(precio.id)
                                      if (e.key === 'Escape') cancelEdit()
                                    }}
                                    autoFocus
                                  />
                                  <Button size="sm" data-testid={`price-save-${precio.id}`} data-precio-id={precio.id} onClick={() => savePrice(precio.id)} disabled={saving}>OK</Button>
                                  <Button size="sm" variant="outline" data-testid={`price-cancel-${precio.id}`} onClick={cancelEdit} disabled={saving}>X</Button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  data-testid={`price-display-${precio.id}`}
                                  data-precio-id={precio.id}
                                  className="font-semibold text-blue-600 hover:underline cursor-pointer"
                                  onClick={() => startEdit(precio)}
                                  title="Clic para editar"
                                >
                                  {formatCOP(Number(precio.precio))}
                                </button>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button size="sm" variant="ghost" data-testid={`tier-delete-${precio.id}`} onClick={() => deleteTier(precio)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                Eliminar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Discrepancy warning: precioBase vs first tier */}
                {(() => {
                  const primerTier = producto.precios[0]
                  const base = Number(producto.precioBase)
                  const tier1 = primerTier ? Number(primerTier.precio) : null
                  if (base > 0 && tier1 && tier1 > 0) {
                    const diff = Math.abs(base - tier1) / base
                    if (diff > 0.3) {
                      return (
                        <div data-testid={`discrepancy-warning-${producto.id}`} className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex items-start gap-2">
                          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                          <span>Precio base ({formatCOP(base)}) difiere {Math.round(diff * 100)}% del primer rango ({formatCOP(tier1)})</span>
                        </div>
                      )
                    }
                  }
                  return null
                })()}

                {/* Gap warning: cantidades sin rango */}
                {(() => {
                  if (producto.precios.length === 0) return null
                  const gaps = calculateGaps(producto.precios)
                  if (gaps.length === 0) return null
                  const base = Number(producto.precioBase)
                  return (
                    <div data-testid={`gap-warning-${producto.id}`} className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex items-start gap-2">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                      <span>
                        Cantidades sin rango: {gaps.map(g => g.desde === g.hasta ? `${g.desde}` : `${g.desde}-${g.hasta}`).join(', ')}.
                        Usarán precio base ({base > 0 ? formatCOP(base) : 'no configurado'}).
                      </span>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Agregar rango de volumen">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Agregar rango de volumen</h3>

          {/* Rangos existentes del producto seleccionado */}
          {(() => {
            const producto = productos.find(p => p.id === modalProductoId)
            if (!producto || producto.precios.length === 0) return null
            return (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Rangos actuales para {producto.nombre}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {producto.precios
                    .sort((a, b) => a.cantMin - b.cantMin)
                    .map(t => (
                      <span key={t.id} className="inline-flex items-center gap-1 text-xs bg-white border rounded px-2 py-0.5">
                        <span className="font-medium">{tierLabel(t.cantMin, t.cantMax)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-semibold text-blue-600">{formatCOP(Number(t.precio))}</span>
                      </span>
                    ))}
                </div>
              </div>
            )
          })()}

          {/* Advertencia de huecos */}
          {(() => {
            const producto = productos.find(p => p.id === modalProductoId)
            if (!producto) return null
            const gaps = calculateGaps(producto.precios)
            if (gaps.length === 0) return null
            return (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                <span>
                  Huecos sin rango: {gaps.map(g => g.desde === g.hasta ? `${g.desde}` : `${g.desde}-${g.hasta}`).join(', ')}.
                  Estas cantidades usarán el precio base ({formatCOP(Number(producto.precioBase)) || 'no configurado'}).
                </span>
              </div>
            )
          })()}

          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">
                Cantidad mínima
                <span className="ml-1 text-xs text-amber-600">(debe ser única por producto)</span>
              </label>
              <Input type="number" min="1" data-testid="modal-cant-min" value={modalCantMin} onChange={(e) => setModalCantMin(e.target.value)} />
              {(() => {
                const producto = productos.find(p => p.id === modalProductoId)
                const cantMin = parseInt(modalCantMin)
                if (producto && !isNaN(cantMin) && cantMinExists(producto.precios, cantMin)) {
                  return (
                    <p className="text-xs text-red-600 mt-1">
                      ⚠ Ya existe un rango que empieza en {cantMin}. Usa un valor diferente.
                    </p>
                  )
                }
                return null
              })()}
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Cantidad máxima (opcional)</label>
              <Input type="number" min="1" data-testid="modal-cant-max" value={modalCantMax} onChange={(e) => setModalCantMax(e.target.value)} placeholder="Sin límite" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Precio unitario</label>
              <Input type="number" min="0" data-testid="modal-precio" value={modalPrecio} onChange={(e) => setModalPrecio(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button data-testid="modal-save" onClick={addTier}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* Historial de precios modal */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Historial de precios — ${historyProducto}`}>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Historial de cambios</h3>
          {historyLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">Cargando...</div>
          ) : historyData.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">No hay registros de historial para este producto</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Fecha</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Precio</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Creado por</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-b-0">
                      <td className="py-2 px-3 text-xs">{new Date(entry.vigenteDesde).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="py-2 px-3 text-right font-medium">${Number(entry.precio).toLocaleString('es-CO')}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{entry.creadoPor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Cerrar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal de impacto de precios */}
      <Modal open={impactoOpen} onClose={() => setImpactoOpen(false)} title={`Impacto de cambio de precio — ${impactoData?.productoNombre || ''}`}>
        <div className="space-y-4">
          {impactoLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">Analizando impacto...</div>
          ) : impactoData ? (
            <>
              {/* Resumen del cambio */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Precio actual:</span>
                  <span className="font-semibold">{formatCOP(impactoData.precioActual)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Precio nuevo:</span>
                  <span className="font-semibold text-blue-600">{formatCOP(impactoData.precioNuevo)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">Cambio:</span>
                  <span className={`font-bold ${impactoData.cambioPorcentaje > 0 ? 'text-red-600' : impactoData.cambioPorcentaje < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {impactoData.cambioPorcentaje > 0 ? '+' : ''}{impactoData.cambioPorcentaje}%
                  </span>
                </div>
              </div>

              {/* Clientes afectados */}
              {impactoData.clientesAfectados.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Clientes con precios especiales ({impactoData.clientesAfectados.length})
                  </h4>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                    <ul className="space-y-1.5 text-xs">
                      {impactoData.clientesAfectados.map(cliente => (
                        <li key={cliente.id} className="flex justify-between items-center">
                          <span className="font-medium">{cliente.nombre}</span>
                          <div className="text-right">
                            <span className="text-muted-foreground">{formatCOP(cliente.precioEspecial)}</span>
                            <span className={`ml-2 font-semibold ${Math.abs(cliente.desviacion) > 20 ? 'text-red-600' : 'text-amber-600'}`}>
                              ({cliente.desviacion > 0 ? '+' : ''}{cliente.desviacion}%)
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Estos clientes tienen precios especiales configurados. El cambio no los afecta automáticamente, pero puede generar desviaciones.
                  </p>
                </div>
              )}

              {/* Pedidos pendientes */}
              {impactoData.pedidosPendientes > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-xs">
                      <p className="font-medium text-blue-900">
                        {impactoData.pedidosPendientes} pedido(s) pendiente(s) con este producto
                      </p>
                      <p className="text-blue-700 mt-1">
                        Los pedidos existentes mantendrán su precio actual. Solo los nuevos pedidos usarán el precio actualizado.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Rangos existentes */}
              {impactoData.rangosExistentes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Rangos de volumen actuales</h4>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex flex-wrap gap-2">
                      {impactoData.rangosExistentes.map((rango, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 text-xs bg-white border rounded px-2 py-1">
                          <span className="font-medium">
                            {rango.cantMax ? `${rango.cantMin}-${rango.cantMax}` : `${rango.cantMin}+`}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-semibold text-blue-600">{formatCOP(rango.precio)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setImpactoOpen(false)}>Cancelar</Button>
                <Button
                  onClick={async () => {
                    if (impactoConfirmCallback.current) {
                      await impactoConfirmCallback.current()
                    }
                    setImpactoOpen(false)
                    setImpactoData(null)
                    impactoConfirmCallback.current = null
                  }}
                >
                  Confirmar cambio
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      {modal}
    </div>
  )
}
