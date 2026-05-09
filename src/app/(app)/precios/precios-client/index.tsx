'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { PrecioVolumen, PreciosClientProps } from './types'
import { formatCOP, hasVolumeTiers } from './types'
import { VolumePriceCard } from './volume-price-card'

export default function PreciosClient({ productos }: PreciosClientProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({})

  function startEdit(precio: PrecioVolumen) {
    const currentPrice = priceOverrides[precio.id] ?? Number(precio.precio)
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
        setPriceOverrides((prev) => ({ ...prev, [precioId]: newPrice }))
        toast.success('Precio actualizado')
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

  function getPrice(precio: PrecioVolumen): number {
    return priceOverrides[precio.id] ?? Number(precio.precio)
  }

  const volumeProducts = productos.filter((p) => hasVolumeTiers(p.precios))
  const flatProducts = productos.filter((p) => !hasVolumeTiers(p.precios))

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configuracion de Precios</h1>

      <div className="space-y-6 mb-8">
        {volumeProducts.map((producto) => (
          <VolumePriceCard
            key={producto.id}
            producto={producto}
            editingId={editingId}
            editValue={editValue}
            saving={saving}
            getPrice={getPrice}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            savePrice={savePrice}
            setEditValue={setEditValue}
          />
        ))}
      </div>

      {flatProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Precios Unitarios</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="w-[120px]">{''}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatProducts.map((producto) =>
                  producto.precios.length > 0 ? (
                    producto.precios.map((precio) => (
                      <TableRow key={precio.id}>
                        <TableCell className="font-medium">
                          {producto.nombre}
                          {producto.contenido && (
                            <span className="text-gray-500 text-sm ml-1">({producto.contenido})</span>
                          )}
                        </TableCell>
                        <TableCell>{precio.canal}</TableCell>
                        <TableCell className="text-right">
                          {editingId === precio.id ? (
                            <Input
                              type="number"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-32 ml-auto text-right"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePrice(precio.id)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              autoFocus
                            />
                          ) : (
                            <span className="font-semibold text-blue-600">
                              {formatCOP(getPrice(precio))}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingId === precio.id ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" onClick={() => savePrice(precio.id)} disabled={saving}>
                                {saving ? '...' : 'OK'}
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                                X
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => startEdit(precio)}>
                              Editar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow key={producto.id}>
                      <TableCell className="font-medium">{producto.nombre}</TableCell>
                      <TableCell className="text-gray-400">Sin precios configurados</TableCell>
                      <TableCell>{''}</TableCell>
                      <TableCell>{''}</TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {productos.filter((p) => p.precios.length === 0).length > 0 && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800 font-medium">Productos sin precios configurados:</p>
          <ul className="text-sm text-yellow-700 mt-1">
            {productos.filter((p) => p.precios.length === 0).map((p) => (
              <li key={p.id}>{p.nombre} ({p.codigo})</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
