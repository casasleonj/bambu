'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'

interface Insumo {
  id: string
  nombre: string
  unidad: string
  stock: number
  stockMin: number
  precioUnit: number
  proveedor: { nombre: string } | null
}

interface Proveedor {
  id: string
  nombre: string
}

interface InsumosClientProps {
  initialInsumos: Insumo[]
  initialProveedores: Proveedor[]
}

export default function InsumosClient({ initialInsumos, initialProveedores }: InsumosClientProps) {
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
    if (!nombre) return
    setSubmitting(true)
    try {
      await fetch('/api/insumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, unidad, stock, stockMin, precioUnit, proveedorId }),
      })
      setShowCrear(false)
      setNombre('')
      fetchData()
    } catch (e) {
      console.error(e)
    }
    setSubmitting(false)
  }

  const alertas = insumos.filter(i => i.stock <= i.stockMin)
  const stockByUnit = insumos.reduce((acc, i) => {
    const unit = i.unidad || 'UNIDAD'
    acc[unit] = (acc[unit] || 0) + Number(i.stock)
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📦 Insumos</h1>
        <Link href="/proveedores" className="text-sm text-blue-600 hover:underline">
          Gestionar proveedores →
        </Link>
      </div>

      {alertas.length > 0 && (
        <div className="p-3 bg-red-100 border border-red-300 rounded-md">
          <div className="font-medium text-red-800">⚠️ Alertas de Stock</div>
          {alertas.map(a => (
            <div key={a.id} className="text-sm text-red-700">
              {a.nombre}: {a.stock}/{a.stockMin} {a.unidad}
            </div>
          ))}
        </div>
      )}

      {fetchError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-red-700 text-sm">{fetchError}</p>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-muted">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{insumos.length}</div>
            <div className="text-sm text-muted-foreground">Insumos</div>
          </CardContent>
        </Card>
        {Object.entries(stockByUnit).map(([unit, total]) => (
          <Card key={unit} className="bg-muted">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{total.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">{unit}</div>
            </CardContent>
          </Card>
        ))}
        <Card className="bg-muted">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{alertas.length}</div>
            <div className="text-sm text-muted-foreground">Alertas</div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => setShowCrear(!showCrear)}>
        ➕ Nuevo Insumo
      </Button>

      {showCrear && (
        <Card>
          <CardHeader>
            <CardTitle>Crear Insumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label htmlFor="insumo-nombre">Nombre</Label><Input id="insumo-nombre" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
            <div><Label htmlFor="insumo-unidad">Unidad</Label>
              <select id="insumo-unidad" className="w-full h-10 rounded-md border bg-background px-3" value={unidad} onChange={e => setUnidad(e.target.value)}>
                <option value="UNIDAD">Unidad</option>
                <option value="KG">Kilogramo</option>
                <option value="LITRO">Litro</option>
                <option value="BOLSA">Bolsa</option>
              </select>
            </div>
            <div><Label htmlFor="insumo-stock">Stock Inicial</Label><Input id="insumo-stock" type="number" value={stock} onChange={e => setStock(e.target.value)} /></div>
            <div><Label htmlFor="insumo-stockMin">Stock Minimo</Label><Input id="insumo-stockMin" type="number" value={stockMin} onChange={e => setStockMin(e.target.value)} /></div>
            <div><Label htmlFor="insumo-precioUnit">Precio Unitario</Label><Input id="insumo-precioUnit" type="number" value={precioUnit} onChange={e => setPrecioUnit(e.target.value)} /></div>
            <div><Label htmlFor="insumo-proveedor">Proveedor</Label>
              <select id="insumo-proveedor" className="w-full h-10 rounded-md border bg-background px-3" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <Button onClick={crearInsumo} disabled={submitting}>💾 Guardar</Button>
          </CardContent>
        </Card>
      )}

      {insumos.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          title="No hay insumos registrados"
          description="Registra los insumos que usas en tu operación"
        />
      ) : (
        <div className="space-y-2">
          {insumos.map(insumo => (
            <Card key={insumo.id} className={insumo.stock <= insumo.stockMin ? 'border-red-300' : ''}>
              <CardContent className="py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{insumo.nombre}</div>
                    <div className="text-sm text-muted-foreground">
                      {insumo.unidad} • Proveedor: {insumo.proveedor?.nombre || 'N/A'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${insumo.stock <= insumo.stockMin ? 'text-red-600' : ''}`}>
                      {insumo.stock} / {insumo.stockMin} min
                    </div>
                    <div className="text-sm text-muted-foreground">${insumo.precioUnit?.toLocaleString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
