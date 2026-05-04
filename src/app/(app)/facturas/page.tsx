'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { DateRangeFilter } from '@/components/date-range-filter'

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
  const [_abonos, _setAbonos] = useState<Abono[]>([])
  const [showAbono, setShowAbono] = useState<string | null>(null)
  const [montoAbono, setMontoAbono] = useState('')
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const searchParam = params.get('search')
    if (searchParam) setSearch(searchParam)
    fetchFacturas()
  }, [])

  const fetchFacturas = async () => {
    try {
      const params = new URLSearchParams()
      if (dateRange.desde && dateRange.hasta) {
        params.set('desde', dateRange.desde)
        params.set('hasta', dateRange.hasta)
      }
      const res = await fetch(`/api/facturas?${params.toString()}`)
      const data = await res.json()
      setFacturas(data.facturas || data.data || [])
    } catch (e) {
      console.error(e)
      toast.error('Error cargando facturas')
    }
  }

  const facturasFiltradas = facturas.filter((f) => {
    if (!search) return true
    const term = search.toLowerCase()
    return (
      f.numero.toLowerCase().includes(term) ||
      f.cliente?.nombre.toLowerCase().includes(term)
    )
  })

  const registrarAbono = async (facturaId: string, clienteId: string) => {
    if (!montoAbono) {
      toast.error('Ingresa un monto')
      return
    }
    const monto = parseFloat(montoAbono)
    if (isNaN(monto) || monto <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/abonos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facturaId,
          clienteId,
          monto,
          metodoPago,
        }),
      })
      if (res.ok) {
        setShowAbono(null)
        setMontoAbono('')
        fetchFacturas()
        toast.success('Abono registrado')
      } else {
        toast.error('Error registrando abono')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error registrando abono')
    }
    setSubmitting(false)
  }

  const getEstadoColor = (estado: string) => {
    if (estado === 'PAGADA') return 'text-green-600'
    if (estado === 'EMITIDA') return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Facturas</h1>
      </div>

      <div className="bg-white p-4 rounded-xl shadow space-y-3">
        <DateRangeFilter onDateChange={(desde, hasta) => { setDateRange({ desde, hasta }); setTimeout(fetchFacturas, 0) }} />
        <Input
          type="text"
          placeholder="Buscar por numero o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {facturasFiltradas.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          title={search ? 'No se encontraron facturas' : 'No hay facturas registradas'}
          description={search ? `No hay resultados para "${search}"` : 'Las facturas se generan automaticamente al crear pedidos con saldo pendiente'}
        />
      ) : (
        <div className="space-y-2">
          {facturasFiltradas.map((factura) => (
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
                      <Label>Metodo de pago</Label>
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
                        disabled={submitting}
                      >
                        Confirmar
                      </Button>
                      <Button variant="outline" onClick={() => setShowAbono(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : factura.saldo > 0 ? (
                  <Button
                    className="mt-3 w-full"
                    onClick={() => setShowAbono(factura.id)}
                  >
                    Registrar Abono
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
