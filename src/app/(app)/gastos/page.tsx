'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Gasto {
  id: string
  categoria: string
  descripcion: string
  monto: number
  responsable: string | null
  fecha: string
}

const categorias = [
  'ARRIENDO',
  'SERVICIOS',
  'INSUMOS',
  'MANTENIMIENTO',
  'TRANSPORTE',
  'NOMINA',
  'OTRO',
]

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [showCrear, setShowCrear] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [categoria, setCategoria] = useState('OTRO')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [responsable, setResponsable] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchGastos(showAll)
  }, [showAll])

  const fetchGastos = async (all = false) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const url = all ? '/api/gastos?all=true' : `/api/gastos?fecha=${today}`
      const res = await fetch(url)
      const data = await res.json()
      setGastos(data.gastos || data.data || [])
    } catch (e) {
      console.error(e)
      toast.error('Error cargando gastos')
    }
  }

  const crearGasto = async () => {
    if (!descripcion || !monto) {
      toast.error('Descripción y monto son obligatorios')
      return
    }
    const montoNum = parseFloat(monto)
    if (isNaN(montoNum) || montoNum <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria, descripcion, monto: montoNum, responsable }),
      })
      if (res.ok) {
        setShowCrear(false)
        setDescripcion('')
        setMonto('')
        setResponsable('')
        fetchGastos(showAll)
        toast.success('Gasto registrado')
      } else {
        toast.error('Error registrando gasto')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error registrando gasto')
    }
    setLoading(false)
  }

  const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0)

  const cats = {
    ARRIENDO: '🏠',
    SERVICIOS: '💡',
    INSUMOS: '📦',
    MANTENIMIENTO: '🔧',
    TRANSPORTE: '🚛',
    NOMINA: '💰',
    OTRO: '📝',
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">📝 Gastos</h1>

      <div className="flex gap-2">
        <Button onClick={() => setShowCrear(!showCrear)}>
          Nuevo Gasto
        </Button>
        <Button variant="outline" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Solo Hoy' : 'Ver Todos'}
        </Button>
      </div>

      {showCrear && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar Gasto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Categoría</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {categorias.map((c) => (
                  <option key={c} value={c}>{cats[c as keyof typeof cats]} {c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle del gasto" />
            </div>
            <div>
              <Label>Monto</Label>
              <Input type="number" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Responsable (opcional)</Label>
              <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Quién paga" />
            </div>
            <Button onClick={crearGasto} disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
          </CardContent>
        </Card>
      )}

      {gastos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="mb-2">{showAll ? 'No hay gastos registrados' : 'No hay gastos registrados hoy'}</p>
          <button
            onClick={() => setShowCrear(true)}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
          >
            + Registrar tu primer gasto
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between p-3 bg-muted rounded-lg font-bold">
            <span>Total Gastos:</span>
            <span>${totalGastos.toLocaleString()}</span>
          </div>
          {gastos.map((gasto) => (
            <Card key={gasto.id}>
              <CardContent className="py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{cats[gasto.categoria as keyof typeof cats]} {gasto.categoria}</div>
                    <div className="text-sm text-muted-foreground">{gasto.descripcion}</div>
                    {gasto.responsable && (
                      <div className="text-xs text-muted-foreground">Responsable: {gasto.responsable}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-medium">${gasto.monto.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{new Date(gasto.fecha).toLocaleDateString()}</div>
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