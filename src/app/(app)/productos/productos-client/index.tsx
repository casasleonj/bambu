'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { Modal } from '@/components/modal'
import type { PrecioVolumen, PreciosClientProps } from './types'
import { formatCOP } from './types'

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
        toast.error(data.error?.message || 'Error actualizando precio')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTier(precioId: string) {
    const ok = await confirm('¿Eliminar este rango de volumen?')
    if (!ok) return
    try {
      const res = await fetch(`/api/precios/${precioId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Rango eliminado')
        setProductos(prev => prev.map(p => ({
          ...p,
          precios: p.precios.filter(pr => pr.id !== precioId)
        })))
      } else {
        toast.error('Error eliminando rango')
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
        toast.error('Error agregando rango')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  async function updateProductoConfig(productoId: string, data: { aplicaDomicilio?: boolean; sobreCostoDomicilio?: number; precioBase?: number }) {
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
        toast.error('Error actualizando configuración')
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
            <Card key={producto.id}>
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
                  <Button size="sm" variant="outline" onClick={() => { setModalProductoId(producto.id); setModalOpen(true) }}>
                    + Agregar rango
                  </Button>
                </div>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
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
                          defaultValue={Number(producto.sobreCostoDomicilio)}
                          onBlur={(e) => updateProductoConfig(producto.id, { sobreCostoDomicilio: parseFloat(e.target.value) || 0 })}
                          className="w-28 text-right h-8 text-sm pl-6"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Precio base:</span>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        type="number"
                        min="0"
                        defaultValue={Number(producto.precioBase)}
                        onBlur={(e) => updateProductoConfig(producto.id, { precioBase: parseFloat(e.target.value) || 0 })}
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
                          <tr key={precio.id} className="border-b last:border-b-0 hover:bg-muted/50">
                            <td className="py-2.5 px-3">{precio.cantMin}</td>
                            <td className="py-2.5 px-3 text-muted-foreground">{precio.cantMax ?? '—'}</td>
                            <td className="py-2.5 px-3 text-right">
                              {editingId === precio.id ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="w-28 text-right h-8 text-sm"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') savePrice(precio.id)
                                      if (e.key === 'Escape') cancelEdit()
                                    }}
                                    autoFocus
                                  />
                                  <Button size="sm" onClick={() => savePrice(precio.id)} disabled={saving}>OK</Button>
                                  <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>X</Button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="font-semibold text-blue-600 hover:underline cursor-pointer"
                                  onClick={() => startEdit(precio)}
                                  title="Clic para editar"
                                >
                                  {formatCOP(Number(precio.precio))}
                                </button>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button size="sm" variant="ghost" onClick={() => deleteTier(precio.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
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
                        <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex items-start gap-2">
                          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                          <span>Precio base ({formatCOP(base)}) difiere {Math.round(diff * 100)}% del primer rango ({formatCOP(tier1)})</span>
                        </div>
                      )
                    }
                  }
                  return null
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Agregar rango de volumen">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Agregar rango de volumen</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Cantidad mínima</label>
              <Input type="number" min="1" value={modalCantMin} onChange={(e) => setModalCantMin(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Cantidad máxima (opcional)</label>
              <Input type="number" min="1" value={modalCantMax} onChange={(e) => setModalCantMax(e.target.value)} placeholder="Sin límite" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Precio unitario</label>
              <Input type="number" min="0" value={modalPrecio} onChange={(e) => setModalPrecio(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={addTier}>Guardar</Button>
          </div>
        </div>
      </Modal>
      {modal}
    </div>
  )
}
