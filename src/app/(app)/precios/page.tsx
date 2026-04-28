'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const PRODUCTOS = [
  { id: 'AGUA_GALON', nombre: 'Agua Galón', emoji: '💧' },
  { id: 'HIELO_5KG', nombre: 'Hielo 5kg', emoji: '🧊' },
  { id: 'BOTELLON_FABRICA', nombre: 'Botellón Fábrica', emoji: '🏭' },
  { id: 'BOTELLON_DOMICILIO', nombre: 'Botellón Domicilio', emoji: '🚚' },
  { id: 'BOLSA_AGUA', nombre: 'Bolsa Agua', emoji: '💧' },
  { id: 'BOLSA_HIELO', nombre: 'Bolsa Hielo', emoji: '🧊' },
]

export default function PreciosPage() {
  const [precios, setPrecios] = useState<Record<string, number>>({})
  const [nuevosPrecios, setNuevosPrecios] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetchPrecios()
  }, [])

  async function fetchPrecios() {
    try {
      const res = await fetch('/api/precios')
      const data = await res.json()
      const map: Record<string, number> = {}
      for (const p of data.precios || []) {
        map[p.producto] = Number(p.precio)
      }
      setPrecios(map)
    } catch (error) {
      console.error('Error fetching precios:', error)
    } finally {
      setLoading(false)
    }
  }

  async function guardarPrecio(productoId: string) {
    const precioStr = nuevosPrecios[productoId]
    if (!precioStr) return
    const precio = parseFloat(precioStr)
    if (isNaN(precio) || precio <= 0) {
      toast.error('Ingrese un precio válido')
      return
    }

    setSaving(productoId)
    try {
      const res = await fetch('/api/precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto: productoId, precio }),
      })
      if (res.ok) {
        setPrecios((prev) => ({ ...prev, [productoId]: precio }))
        setNuevosPrecios((prev) => ({ ...prev, [productoId]: '' }))
        toast.success('Precio guardado')
      } else {
        toast.error('Error guardando precio')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error guardando precio')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configuración de Precios</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PRODUCTOS.map((prod) => (
          <Card key={prod.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {prod.emoji} {prod.nombre}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-bold text-blue-600">
                <span className="text-sm font-normal text-gray-500">Precio actual:</span> ${(precios[prod.id] || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">({prod.id})</div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Nuevo precio"
                  value={nuevosPrecios[prod.id] || ''}
                  onChange={(e) =>
                    setNuevosPrecios((prev) => ({ ...prev, [prod.id]: e.target.value }))
                  }
                />
                <Button
                  onClick={() => guardarPrecio(prod.id)}
                  disabled={saving === prod.id}
                >
                  {saving === prod.id ? '...' : 'Guardar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
