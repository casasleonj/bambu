'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { DateRangeFilter } from '@/components/date-range-filter'
import { Modal } from '@/components/modal'
import { FacturaDetail } from './factura-detail'
import './factura-print.css'
import type { Factura, EmpresaConfig } from './types'

const DEFAULT_EMPRESA: EmpresaConfig = {
  nombre: 'Agua Bambu SAS',
  nit: '900.123.456-7',
  direccion: 'Calle Principal #123, Bogotá',
  telefono: '311 123 4567',
  email: 'info@aguabambu.com',
}

export default function FacturasPage() {
  const searchParams = useSearchParams()
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [showAbono, setShowAbono] = useState<string | null>(null)
  const [montoAbono, setMontoAbono] = useState('')
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })
  const [highlightedFactura, setHighlightedFactura] = useState<string | null>(null)
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [facturaDetail, setFacturaDetail] = useState<Factura | null>(null)
  const [empresaConfig, setEmpresaConfig] = useState<EmpresaConfig>(DEFAULT_EMPRESA)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const openFacturaParam = searchParams.get('openFactura')

  // Load empresa config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config?keys=empresa_nombre,empresa_nit,empresa_direccion,empresa_telefono,empresa_email')
        if (res.ok) {
          const data = await res.json()
          const configs = data.data || {}
          setEmpresaConfig({
            nombre: configs.empresa_nombre || DEFAULT_EMPRESA.nombre,
            nit: configs.empresa_nit || DEFAULT_EMPRESA.nit,
            direccion: configs.empresa_direccion || DEFAULT_EMPRESA.direccion,
            telefono: configs.empresa_telefono || DEFAULT_EMPRESA.telefono,
            email: configs.empresa_email || DEFAULT_EMPRESA.email,
          })
        }
      } catch {
        // Use defaults
      }
    }
    loadConfig()
  }, [])

  // Auto-open factura detail from URL param
  useEffect(() => {
    if (!openFacturaParam || facturas.length === 0) return
    const factura = facturas.find(f => f.id === openFacturaParam || f.numero === openFacturaParam)
    if (factura) {
      openFacturaDetail(factura.id)
    }
  }, [openFacturaParam, facturas])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const searchParam = params.get('search')
    if (searchParam) setSearch(searchParam)
  }, [])

  const fetchFacturas = useCallback(async () => {
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
  }, [dateRange])

  useEffect(() => { fetchFacturas() }, [fetchFacturas])

  const openFacturaDetail = async (id: string) => {
    setLoadingDetail(true)
    setSelectedFactura(facturas.find(f => f.id === id) || null)
    try {
      const res = await fetch(`/api/facturas/${id}`)
      if (res.ok) {
        const data = await res.json()
        setFacturaDetail(data.factura)
        setHighlightedFactura(id)
      } else {
        toast.error('No se pudo cargar el detalle de la factura')
      }
    } catch {
      toast.error('Error cargando detalle')
    }
    setLoadingDetail(false)
  }

  const closeFacturaDetail = () => {
    setSelectedFactura(null)
    setFacturaDetail(null)
    setHighlightedFactura(null)
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
        if (facturaDetail && facturaDetail.id === facturaId) {
          openFacturaDetail(facturaId)
        }
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

  const handleDateChange = useCallback((desde: string | null, hasta: string | null) => {
    setDateRange({ desde, hasta })
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Facturas</h1>
      </div>

      <div className="bg-white p-4 rounded-xl shadow space-y-3">
        <DateRangeFilter onDateChange={handleDateChange} />
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
            <Card
              key={factura.id}
              ref={(el) => { if (el) cardRefs.current.set(factura.id, el) }}
              className={`transition-all duration-500 cursor-pointer ${highlightedFactura === factura.id ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}`}
              onClick={() => openFacturaDetail(factura.id)}
            >
              <CardHeader className="py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg">#{factura.numero}</CardTitle>
                      {factura.pedido && (
                        <a
                          href={`/pedidos?openPedido=${factura.pedido.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          → Pedido #{factura.pedido.numero}
                        </a>
                      )}
                    </div>
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
                  {Number(factura.montoPagado || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pagado:</span>
                      <span className="font-medium text-green-600">${Number(factura.montoPagado).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo:</span>
                    <span className={factura.saldo > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                      ${factura.saldo.toLocaleString()}
                    </span>
                  </div>
                </div>

                {showAbono === factura.id ? (
                  <div className="mt-3 space-y-2 p-3 bg-muted rounded-md" onClick={(e) => e.stopPropagation()}>
                    <Label>Monto del abono</Label>
                    <Input
                      type="number"
                      min="0"
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
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowAbono(factura.id)
                    }}
                  >
                    Registrar Abono
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de detalle de factura */}
      <Modal open={!!selectedFactura} onClose={closeFacturaDetail} className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-auto mt-10 md:mt-0 p-0">
        {loadingDetail ? (
          <div className="p-8 text-center text-gray-500">Cargando detalle...</div>
        ) : facturaDetail ? (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Detalle de Factura</h2>
              <button
                onClick={closeFacturaDetail}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <FacturaDetail
              factura={facturaDetail}
              empresaConfig={empresaConfig}
              onRegistrarAbono={() => {
                setShowAbono(facturaDetail.id)
                setMontoAbono('')
              }}
            />

            {/* Abono inline dentro del modal */}
            {showAbono === facturaDetail.id && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                <h3 className="text-sm font-semibold mb-3">Registrar Abono</h3>
                <div className="space-y-3">
                  <div>
                    <Label>Monto del abono</Label>
                    <Input
                      type="number"
                      min="0"
                      value={montoAbono}
                      onChange={(e) => setMontoAbono(e.target.value)}
                      placeholder="Monto a pagar"
                    />
                  </div>
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
                      onClick={() => registrarAbono(facturaDetail.id, facturaDetail.cliente?.id || '')}
                      disabled={submitting}
                    >
                      Confirmar
                    </Button>
                    <Button variant="outline" onClick={() => setShowAbono(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
