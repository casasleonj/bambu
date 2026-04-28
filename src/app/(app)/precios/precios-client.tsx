'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

interface PrecioVolumen {
  id: string
  productoId: string
  canal: string
  cantMin: number
  cantMax: number | null
  precio: string | number
  activo: boolean
}

interface Producto {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  unidad: string
  contenido: string | null
  precios: PrecioVolumen[]
}

interface PreciosClientProps {
  productos: Producto[]
}

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function tierLabel(cantMin: number, cantMax: number | null): string {
  if (cantMax === null) return `${cantMin}+`
  if (cantMin === cantMax) return `${cantMin}`
  return `${cantMin}-${cantMax}`
}

/** Check if a product has volume tiers (multiple price rows per channel) */
function hasVolumeTiers(precios: PrecioVolumen[]): boolean {
  const canalCounts = new Map<string, number>()
  for (const p of precios) {
    canalCounts.set(p.canal, (canalCounts.get(p.canal) || 0) + 1)
  }
  for (const count of canalCounts.values()) {
    if (count > 1) return true
  }
  return false
}

export default function PreciosClient({ productos }: PreciosClientProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  // Track local price overrides so UI updates after save
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
        toast.error(data.error || 'Error actualizando precio')
      }
    } catch {
      toast.error('Error de conexion')
    } finally {
      setSaving(false)
    }
  }

  function getPrice(precio: PrecioVolumen): number {
    return priceOverrides[precio.id] ?? Number(precio.precio)
  }

  // Separate products with volume tiers from flat-priced products
  const volumeProducts = productos.filter((p) => hasVolumeTiers(p.precios))
  const flatProducts = productos.filter((p) => !hasVolumeTiers(p.precios))

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        Configuracion de Precios
      </h1>

      {/* Volume-tiered products */}
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

      {/* Flat-priced products */}
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
                            <span className="text-gray-500 text-sm ml-1">
                              ({producto.contenido})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{precio.canal}</TableCell>
                        <TableCell className="text-right">
                          {editingId === precio.id ? (
                            <Input
                              type="number"
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
                              <Button
                                size="sm"
                                onClick={() => savePrice(precio.id)}
                                disabled={saving}
                              >
                                {saving ? '...' : 'OK'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEdit}
                                disabled={saving}
                              >
                                X
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(precio)}
                            >
                              Editar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow key={producto.id}>
                      <TableCell className="font-medium">
                        {producto.nombre}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        Sin precios configurados
                      </TableCell>
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

      {/* Products with no prices at all */}
      {productos.filter((p) => p.precios.length === 0).length > 0 && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800 font-medium">
            Productos sin precios configurados:
          </p>
          <ul className="text-sm text-yellow-700 mt-1">
            {productos
              .filter((p) => p.precios.length === 0)
              .map((p) => (
                <li key={p.id}>
                  {p.nombre} ({p.codigo})
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Card that renders a volume pricing table for a single product */
function VolumePriceCard({
  producto,
  editingId,
  editValue,
  saving,
  getPrice,
  startEdit,
  cancelEdit,
  savePrice,
  setEditValue,
}: {
  producto: Producto
  editingId: string | null
  editValue: string
  saving: boolean
  getPrice: (p: PrecioVolumen) => number
  startEdit: (p: PrecioVolumen) => void
  cancelEdit: () => void
  savePrice: (id: string) => Promise<void>
  setEditValue: (v: string) => void
}) {
  // Group prices by canal
  const canales = new Map<string, PrecioVolumen[]>()
  for (const p of producto.precios) {
    const existing = canales.get(p.canal) || []
    existing.push(p)
    canales.set(p.canal, existing)
  }

  // Collect unique tier labels across all canales
  const allTiers: { cantMin: number; cantMax: number | null; label: string }[] = []
  const seenTiers = new Set<string>()
  for (const prices of canales.values()) {
    for (const p of prices) {
      const label = tierLabel(p.cantMin, p.cantMax)
      if (!seenTiers.has(label)) {
        seenTiers.add(label)
        allTiers.push({ cantMin: p.cantMin, cantMax: p.cantMax, label })
      }
    }
  }
  allTiers.sort((a, b) => a.cantMin - b.cantMin)

  const canalNames = Array.from(canales.keys()).sort()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {producto.nombre}
          {producto.contenido && (
            <span className="text-gray-500 text-sm font-normal ml-2">
              ({producto.contenido})
            </span>
          )}
        </CardTitle>
        {producto.descripcion && (
          <p className="text-sm text-gray-500">{producto.descripcion}</p>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canal</TableHead>
              {allTiers.map((tier) => (
                <TableHead key={tier.label} className="text-center">
                  {tier.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {canalNames.map((canal) => {
              const prices = canales.get(canal) || []
              return (
                <TableRow key={canal}>
                  <TableCell className="font-medium">{canal}</TableCell>
                  {allTiers.map((tier) => {
                    const precio = prices.find(
                      (p) => p.cantMin === tier.cantMin && p.cantMax === tier.cantMax
                    )
                    if (!precio) {
                      return (
                        <TableCell key={tier.label} className="text-center text-gray-300">
                          --
                        </TableCell>
                      )
                    }
                    return (
                      <TableCell key={tier.label} className="text-center">
                        {editingId === precio.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 text-right"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePrice(precio.id)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => savePrice(precio.id)}
                              disabled={saving}
                            >
                              {saving ? '...' : 'OK'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              X
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="font-semibold text-blue-600 hover:underline cursor-pointer"
                            onClick={() => startEdit(precio)}
                            title="Clic para editar"
                          >
                            {formatCOP(getPrice(precio))}
                          </button>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
