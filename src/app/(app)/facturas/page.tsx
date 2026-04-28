'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Factura {
  id: string
  numero: string
  fecha: string
  total: number
  saldo: number
  estado: string
  cliente?: {
    id: string
    nombre: string
    telefono: string
  }
}

interface Abono {
  id: string
  numero: string
  monto: number
  metodoPago: string
  fecha: string
}

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [showAbono, setShowAbono] = useState<string | null>(null)
  const [montoAbono, setMontoAbono] = useState('')
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchFacturas()
  }, [])

  const fetchFacturas = async () => {
    try {
      const res = await fetch('/api/facturas')
      const data = await res.json()
      setFacturas(data.facturas || data.data || [])
    } catch (e) {
      console.error(e)
    }
  }

  const registrarAbono = async (facturaId: string, clienteId: string) => {
    if (!montoAbono) return
    setLoading(true)
    try {
      const res = await fetch('/api/abonos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facturaId,
          clienteId,
          monto: parseFloat(montoAbono),
          metodoPago,
        }),
      })
      if (res.ok) {
        setShowAbono(null)
        setMontoAbono('')
        fetchFacturas()
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const getEstadoColor = (estado: string) => {
    if (estado === 'PAGADA') return 'text-green-600'
    if (estado === 'EMITIDA') return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">📋 Facturas</h1>

      {facturas.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No hay facturas registradas
        </div>
      ) : (
        <div className="space-y-2">
          {facturas.map((factura) => (
            <Card key={factura.id}>
              <CardHeader className="py-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg">#{factura.numero}</CardTitle>
                  <span className={`text-sm font-medium ${getEstadoColor(factura.estado)}`}>
                    {factura.estado}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span>{(factura.cliente?.nombre || 'N/A')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fecha:</span>
                    <span>{new Date(factura.fecha).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-medium">${factura.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo:</span>
                    <span className={factura.saldo > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                      ${factura.saldo.toLocaleString()}
                    </span>
                  </div>
                </div>

                {showAbono === factura.id ? (
                  <div className="mt-3 space-y-2 p-3 bg-muted rounded-md">
                    <Label>Monto del abono</Label>
                    <Input
                      type="number"
                      value={montoAbono}
                      onChange={(e) => setMontoAbono(e.target.value)}
                      placeholder="Monto a pagar"
                    />
                    <div>
                      <Label>Método de pago</Label>
                      <select
                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                        value={metodoPago}
                        onChange={(e) => setMetodoPago(e.target.value)}
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="NEQUI">Nequi</option>
                        <option value="DAVIPLATA">Daviplata</option>
                        <option value="BONO">Bono</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => registrarAbono(factura.id, factura.cliente?.id || '')}
                        disabled={loading}
                      >
                        ✅ Confirmar
                      </Button>
                      <Button variant="outline" onClick={() => setShowAbono(null)}>
                        ❌ Cancelar
                      </Button>
                    </div>
                  </div>
                ) : factura.saldo > 0 ? (
                  <Button
                    className="mt-3 w-full"
                    onClick={() => setShowAbono(factura.id)}
                  >
                    💰 Registrar Abono
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}