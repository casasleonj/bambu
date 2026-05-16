'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/modal'
import { useConfirm } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import type { Insumo, Proveedor, InsumosClientProps } from './types'
import { InsumoDetailModal } from './insumo-detail-modal'

const UNIDADES = ['UNIDAD', 'LITRO', 'KG', 'PACA', 'BOLSA', 'CAJA', 'MTS', 'GALON']

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
    'bg-orange-500', 'bg-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function InsumosClient({ initialInsumos, initialProveedores }: InsumosClientProps) {
  const { confirm, modal } = useConfirm()
  const [insumos, setInsumos] = useState<Insumo[]>(initialInsumos)
  const [proveedores, setProveedores] = useState<Proveedor[]>(initialProveedores)
  const [showCrear, setShowCrear] = useState(false)
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState('UNIDAD')
  const [stock, setStock] = useState('')
  const [stockMin, setStockMin] = useState('')
  const [precioUnit, setPrecioUnit] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showEditar, setShowEditar] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editUnidad, setEditUnidad] = useState('UNIDAD')
  const [editStock, setEditStock] = useState('')
  const [editStockMin, setEditStockMin] = useState('')
  const [editPrecioUnit, setEditPrecioUnit] = useState('')
  const [editProveedorId, setEditProveedorId] = useState('')

  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [selectedInsumo, setSelectedInsumo] = useState<Insumo | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    if (!openMenuId) return
    const handleClick = () => setOpenMenuId(null)
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenuId])

  const fetchData = async () => {
    setFetchError(null)
    try {
      const [iRes, pRes] = await Promise.all([
        fetch('/api/insumos'),
        fetch('/api/proveedores'),
      ])
      if (!iRes.ok || !pRes.ok) throw new Error('Error al cargar datos')
      const iData = await iRes.json()
      const pData = await pRes.json()
      setInsumos(iData.insumos || [])
      setProveedores(pData.proveedores || [])
    } catch (e) {
      console.error(e)
      setFetchError('No se pudieron cargar los insumos')
      toast.error('Error cargando insumos')
    }
  }

  const crearInsumo = async () => {
    if (!nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/insumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          unidad,
          stock: Number(stock) || 0,
          stockMin: Number(stockMin) || 0,
          precioUnit: Number(precioUnit) || 0,
          proveedorId: proveedorId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.message || 'Error al crear insumo')
      } else {
        setShowCrear(false)
        setNombre('')
        setUnidad('UNIDAD')
        setStock('')
        setStockMin('')
        setPrecioUnit('')
        setProveedorId('')
        fetchData()
        toast.success('Insumo creado')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error al crear insumo')
    }
    setSubmitting(false)
  }

  const openEdit = (insumo: Insumo) => {
    setEditingId(insumo.id)
    setEditNombre(insumo.nombre)
    setEditUnidad(insumo.unidad)
    setEditStock(String(insumo.stock))
    setEditStockMin(String(insumo.stockMin))
    setEditPrecioUnit(String(insumo.precioUnit))
    setEditProveedorId(insumo.proveedor?.id || '')
    setShowEditar(true)
    setOpenMenuId(null)
  }

  const actualizarInsumo = async () => {
    if (!editingId || !editNombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/insumos/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: editNombre,
          unidad: editUnidad,
          stock: Number(editStock) || 0,
          stockMin: Number(editStockMin) || 0,
          precioUnit: Number(editPrecioUnit) || 0,
          proveedorId: editProveedorId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.message || 'Error al actualizar insumo')
      } else {
        setShowEditar(false)
        setEditingId(null)
        fetchData()
        toast.success('Insumo actualizado')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error al actualizar insumo')
    }
    setSubmitting(false)
  }

  const eliminarInsumo = async (insumo: Insumo) => {
    const ok = await confirm({
      title: 'Eliminar insumo',
      message: `¿Eliminar "${insumo.nombre}"?`,
      variant: 'destructive',
      consequences: ['Se marcará como inactivo', 'No se podrá usar en nuevas compras'],
      confirmLabel: 'Eliminar',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/insumos/${insumo.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.message || 'Error al eliminar insumo')
      } else {
        fetchData()
        toast.success('Insumo eliminado')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error al eliminar insumo')
    }
  }

  const openDetail = (insumo: Insumo) => {
    setSelectedInsumo(insumo)
    setShowDetail(true)
  }

  const closeDetail = () => {
    setShowDetail(false)
    setSelectedInsumo(null)
  }

  const filtered = insumos
    .filter(i => i.activo !== false)
    .filter(i => {
      if (!search) return true
      const term = search.toLowerCase()
      return (
        i.nombre.toLowerCase().includes(term) ||
        i.unidad.toLowerCase().includes(term) ||
        i.proveedor?.nombre?.toLowerCase().includes(term)
      )
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      return dir * a.nombre.localeCompare(b.nombre)
    })

  const alertas = insumos.filter(i => i.activo !== false && i.stock <= i.stockMin)
  const valorTotalInventario = insumos
    .filter(i => i.activo !== false)
    .reduce((sum, i) => sum + i.stock * i.precioUnit, 0)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insumos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona los insumos de tu operación</p>
        </div>
        <Link href="/proveedores" className="text-sm text-blue-600 hover:underline">
          Gestionar proveedores →
        </Link>
      </div>

      {alertas.length > 0 && (
        <Card className="border-red-300 bg-red-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="font-medium text-red-800">Alertas de Stock ({alertas.length})</span>
            </div>
            <div className="space-y-1">
              {alertas.map(a => (
                <div key={a.id} className="text-sm text-red-700">
                  <span className="font-medium">{a.nombre}</span>: {a.stock} / {a.stockMin} min {a.unidad}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {fetchError && (
        <Card className="border-red-300 bg-red-50/50">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-red-700 text-sm">{fetchError}</p>
            <Button size="sm" variant="destructive" onClick={fetchData}>Reintentar</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{insumos.filter(i => i.activo !== false).length}</div>
            <div className="text-sm text-muted-foreground">Insumos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{formatCurrency(valorTotalInventario)}</div>
            <div className="text-sm text-muted-foreground">Valor en stock</div>
          </CardContent>
        </Card>
        {alertas.length > 0 && (
          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{alertas.length}</div>
              <div className="text-sm text-muted-foreground">Alertas</div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, unidad, proveedor..."
            className="w-full h-10 rounded-lg border bg-background pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          className="shrink-0 gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          Nombre {sortDir === 'asc' ? 'A-Z' : 'Z-A'}
        </Button>
      </div>

      {search && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para &quot;{search}&quot;
        </p>
      )}

      <Button onClick={() => setShowCrear(!showCrear)} variant={showCrear ? 'secondary' : 'default'}>
        {showCrear ? 'Cancelar' : '+ Nuevo Insumo'}
      </Button>

      {showCrear && (
        <Card>
          <CardHeader>
            <CardTitle>Crear Insumo</CardTitle>
          </CardHeader>
          <form onSubmit={(e) => { e.preventDefault(); crearInsumo() }}>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="insumo-nombre">Nombre <span className="text-red-500">*</span></Label>
                <Input id="insumo-nombre" required value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="insumo-unidad">Unidad</Label>
                <select id="insumo-unidad" className="w-full h-10 rounded-md border bg-background px-3 mt-1" value={unidad} onChange={e => setUnidad(e.target.value)}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="insumo-stock">Stock Inicial</Label>
                  <Input id="insumo-stock" type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="insumo-stockMin">Stock Mínimo</Label>
                  <Input id="insumo-stockMin" type="number" min="0" value={stockMin} onChange={e => setStockMin(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="insumo-precioUnit">Precio Unitario</Label>
                  <Input id="insumo-precioUnit" type="number" min="0" value={precioUnit} onChange={e => setPrecioUnit(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="insumo-proveedor">Proveedor</Label>
                  <select id="insumo-proveedor" className="w-full h-10 rounded-md border bg-background px-3 mt-1" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={submitting || !nombre.trim()}>
                {submitting ? 'Guardando...' : 'Guardar'}
              </Button>
            </CardContent>
          </form>
        </Card>
      )}

      {filtered.length === 0 ? (
        search ? (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
            title="Sin resultados"
            description={`No se encontraron insumos para "${search}"`}
          />
        ) : (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
            title="No hay insumos registrados"
            description="Registra los insumos que usas en tu operación"
          />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(insumo => {
            const stockPct = insumo.stockMin > 0
              ? Math.round((insumo.stock / insumo.stockMin) * 100)
              : insumo.stock > 0 ? 100 : 0
            const isLow = insumo.stock <= insumo.stockMin

            return (
              <Card
                key={insumo.id}
                className={`cursor-pointer transition hover:shadow-md ${isLow ? 'border-red-300 bg-red-50/30' : ''}`}
                onClick={() => openDetail(insumo)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${getAvatarColor(insumo.nombre)}`}>
                      {insumo.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="text-sm font-semibold truncate">{insumo.nombre}</h2>
                          <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium mt-1">
                            {insumo.unidad}
                          </span>
                        </div>
                        <div className="relative shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuId(openMenuId === insumo.id ? null : insumo.id)
                            }}
                            className="p-1 rounded-md hover:bg-muted transition"
                          >
                            <svg className="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                          {openMenuId === insumo.id && (
                            <div className="absolute right-0 top-8 w-40 bg-popover border rounded-lg shadow-lg py-1 z-50">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(insumo); }}
                                className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Editar
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); eliminarInsumo(insumo); }}
                                className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-red-600 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Stock</span>
                          <span className={`font-medium ${isLow ? 'text-red-600' : ''}`}>
                            {insumo.stock} / {insumo.stockMin} mín
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              stockPct <= 0 ? 'bg-red-600' : stockPct < 50 ? 'bg-red-500' : stockPct < 100 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(stockPct, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="truncate">{insumo.proveedor?.nombre || 'Sin proveedor'}</span>
                        </div>
                        <span className="font-medium text-foreground">{formatCurrency(insumo.precioUnit)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <InsumoDetailModal
        open={showDetail}
        onClose={closeDetail}
        insumo={selectedInsumo}
        onEdit={openEdit}
        onDelete={eliminarInsumo}
      />

      <Modal open={showEditar} onClose={() => { setShowEditar(false); setEditingId(null); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Editar insumo</h2>
        <form onSubmit={(e) => { e.preventDefault(); actualizarInsumo() }}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-nombre">Nombre <span className="text-red-500">*</span></Label>
              <Input id="edit-nombre" required value={editNombre} onChange={e => setEditNombre(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-unidad">Unidad</Label>
              <select id="edit-unidad" className="w-full h-10 rounded-md border bg-background px-3 mt-1" value={editUnidad} onChange={e => setEditUnidad(e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-stock">Stock</Label>
                <Input id="edit-stock" type="number" min="0" value={editStock} onChange={e => setEditStock(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="edit-stockMin">Stock Mínimo</Label>
                <Input id="edit-stockMin" type="number" min="0" value={editStockMin} onChange={e => setEditStockMin(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-precioUnit">Precio Unitario</Label>
                <Input id="edit-precioUnit" type="number" min="0" value={editPrecioUnit} onChange={e => setEditPrecioUnit(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="edit-proveedor">Proveedor</Label>
                <select id="edit-proveedor" className="w-full h-10 rounded-md border bg-background px-3 mt-1" value={editProveedorId} onChange={e => setEditProveedorId(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowEditar(false); setEditingId(null); }}>Cancelar</Button>
              <Button type="submit" disabled={submitting || !editNombre.trim()}>
                {submitting ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {modal}
    </div>
  )
}
