'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Insumo {
  id: string
  nombre: string
  unidad: string
  stock: number
  stockMin: number
  precioUnit: number
  proveedor: { nombre: string } | null
}

export default function InsumosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [showCrear, setShowCrear] = useState(false)
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState('UNIDAD')
  const [stock, setStock] = useState('')
  const [stockMin, setStockMin] = useState('')
  const [precioUnit, setPrecioUnit] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [iRes, pRes] = await Promise.all([
        fetch('/api/insumos'),
        fetch('/api/proveedores'),
      ])
      const iData = await iRes.json()
      const pData = await pRes.json()
      setInsumos(iData.insumos || [])
      setProveedores(pData.proveedores || [])
    } catch (e) {
      console.error(e)
    }
  }

  const crearInsumo = async () => {
    if (!nombre) return
    setLoading(true)
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
    setLoading(false)
  }

  const alertas = insumos.filter(i => i.stock <= i.stockMin)
  const totalStock = insumos.reduce((sum, i) => sum + i.stock, 0)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📦 Insumos</h1>
        <Button variant="outline" onClick={fetchData}>🔄 Refrescar</Button>
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

      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-muted">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{insumos.length}</div>
            <div className="text-sm text-muted-foreground">Insumos</div>
          </CardContent>
        </Card>
        <Card className="bg-muted">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totalStock.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Stock</div>
          </CardContent>
        </Card>
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
            <div><Label>Nombre</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} /></div>
            <div><Label>Unidad</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3" value={unidad} onChange={e => setUnidad(e.target.value)}>
                <option value="UNIDAD">Unidad</option>
                <option value="KG">Kilogramo</option>
                <option value="LITRO">Litro</option>
                <option value="BOLSA">Bolsa</option>
              </select>
            </div>
            <div><Label>Stock Inicial</Label><Input type="number" value={stock} onChange={e => setStock(e.target.value)} /></div>
            <div><Label>Stock Mínimo</Label><Input type="number" value={stockMin} onChange={e => setStockMin(e.target.value)} /></div>
            <div><Label>Precio Unitario</Label><Input type="number" value={precioUnit} onChange={e => setPrecioUnit(e.target.value)} /></div>
            <div><Label>Proveedor</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <Button onClick={crearInsumo} disabled={loading}>💾 Guardar</Button>
          </CardContent>
        </Card>
      )}

      {insumos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No hay insumos registrados</div>
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