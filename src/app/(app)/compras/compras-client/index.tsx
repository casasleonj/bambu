'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import type { Proveedor, Insumo, CompraInsumo } from './types'

export default function ComprasPage() {
  const [compras, setCompras] = useState<CompraInsumo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [showCrear, setShowCrear] = useState(false)
  const [proveedorId, setProveedorId] = useState('')
  const [insumoId, setInsumoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [montoTotal, setMontoTotal] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [cRes, pRes, iRes] = await Promise.all([
        fetch('/api/compras'),
        fetch('/api/proveedores'),
        fetch('/api/insumos'),
      ])
      const cData = await cRes.json()
      const pData = await pRes.json()
      const iData = await iRes.json()
      setCompras(cData.compras || cData.data || [])
      setProveedores(pData.proveedores || pData.data || [])
      setInsumos(iData.insumos || iData.data || [])
    } catch (e) {
      console.error(e)
      toast.error('Error cargando compras')
    }
  }

  const crearCompra = async () => {
    if (!proveedorId || !insumoId || !cantidad || !montoTotal) {
      toast.error('Completa todos los campos')
      return
    }
    const cantNum = Number(cantidad)
    const montoNum = Number(montoTotal)
    if (cantNum <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    if (montoNum <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedorId,
          insumoId,
          cantidad: cantNum,
          montoTotal: montoNum,
        }),
      })
      if (res.ok) {
        setShowCrear(false)
        setProveedorId('')
        setInsumoId('')
        setCantidad('')
        setMontoTotal('')
        fetchData()
        toast.success('Compra registrada')
      } else {
        toast.error('Error registrando compra')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error registrando compra')
    }
    setSubmitting(false)
  }

  const totalCompras = compras.reduce((sum, c) => sum + c.montoTotal, 0)

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Compras de Insumos</h1>

      <Button onClick={() => setShowCrear(!showCrear)}>
        Nueva Compra
      </Button>

      {showCrear && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar Compra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Proveedor</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Insumo</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                value={insumoId}
                onChange={(e) => setInsumoId(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>{i.nombre} ({i.unidad})</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Cantidad</Label>
              <Input
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Monto Total</Label>
              <Input
                type="number"
                value={montoTotal}
                onChange={(e) => setMontoTotal(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button onClick={crearCompra} disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar'}</Button>
          </CardContent>
        </Card>
      )}

      {compras.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          title="No hay compras registradas"
          description="Registra las compras de insumos y materiales"
        />
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between p-3 bg-muted rounded-lg font-bold">
            <span>Total Compras:</span>
            <span>${totalCompras.toLocaleString()}</span>
          </div>
          {compras.map((compra) => (
            <Card key={compra.id}>
              <CardContent className="py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{compra.numero}</div>
                    <div className="text-sm text-muted-foreground">
                      {compra.insumo.nombre} • {compra.cantidad} {compra.insumo.unidad}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Proveedor: {compra.proveedor.nombre}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">${compra.montoTotal.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(compra.fecha).toLocaleDateString()}
                    </div>
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
