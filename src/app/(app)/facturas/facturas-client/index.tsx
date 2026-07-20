'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/empty-state'
import { DateRangeFilter } from '@/components/date-range-filter'
import { UnifiedSearch } from '@/components/unified-search'
import type { UnifiedSelection } from '@/components/unified-search'
import { Modal } from '@/components/modal'
import { FacturaDetail } from './factura-detail'
import './factura-print.css'
import { getAnonymousClientDisplayName } from '@/lib/cliente-canonical'
import type { Factura, EmpresaConfig } from './types'
import { SkeletonPage } from '@/components/skeleton'

const DEFAULT_EMPRESA: EmpresaConfig = {
  nombre: 'Agua Bambú SAS',
  nit: '900.123.456-7',
  direccion: 'Calle Principal #123, Bogotá',
  telefono: '311 123 4567',
  email: 'info@aguabambu.com',
}

type SortField = 'fecha' | 'total' | 'saldo'
type SortDir = 'asc' | 'desc'
type EstadoFilter = 'TODAS' | 'PAGADA' | 'EMITIDA' | 'ANULADA'

export default function FacturasPage() {
  const params = useShallowSearchParams()
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [abonoFactura, setAbonoFactura] = useState<Factura | null>(null)
  const [montoAbono, setMontoAbono] = useState('')
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [submitting, setSubmitting] = useState(false)

  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })
  const [highlightedFactura, setHighlightedFactura] = useState<string | null>(null)
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [facturaDetail, setFacturaDetail] = useState<Factura | null>(null)
  const [empresaConfig, setEmpresaConfig] = useState<EmpresaConfig>(DEFAULT_EMPRESA)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [hasAutoOpened, setHasAutoOpened] = useState(false)
  const [selection, setSelection] = useState<UnifiedSelection>(null)
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())
  const openFacturaParam = params.get('openFactura')

  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('TODAS')
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totales, setTotales] = useState({
    totalFacturado: 0,
    totalCobrado: 0,
    totalPorCobrar: 0,
    count: 0,
  })

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config?keys=empresa_nombre,empresa_nit,empresa_direccion,empresa_telefono,empresa_email')
        if (res.ok) {
          const data = await res.json()
          // apiSuccess hace spread de los valores, no los envuelve en "data"
          const configs = data
          setEmpresaConfig({
            nombre: configs.empresa_nombre || DEFAULT_EMPRESA.nombre,
            nit: configs.empresa_nit || DEFAULT_EMPRESA.nit,
            direccion: configs.empresa_direccion || DEFAULT_EMPRESA.direccion,
            telefono: configs.empresa_telefono || DEFAULT_EMPRESA.telefono,
            email: configs.empresa_email || DEFAULT_EMPRESA.email,
          })
        }
      } catch { /* Use defaults */ }
    }
    loadConfig()
  }, [])

  const openFacturaDetail = useCallback(async (id: string) => {
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
  }, [facturas])

  useEffect(() => {
    if (!openFacturaParam || facturas.length === 0 || hasAutoOpened) return
    const factura = facturas.find(f => f.id === openFacturaParam || f.numero === openFacturaParam)
    if (factura) {
      openFacturaDetail(factura.id)
      setHasAutoOpened(true)
      params.set({ openFactura: undefined }, { history: 'replace' })
    }
  }, [openFacturaParam, facturas, hasAutoOpened, params, openFacturaDetail])

  const fetchFacturas = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (dateRange.desde) query.set('desde', dateRange.desde)
      if (dateRange.hasta) query.set('hasta', dateRange.hasta)
      const res = await fetch(`/api/facturas?${query.toString()}`)
      const data = await res.json()
      setFacturas(data.data || data.facturas || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 0)
      setTotales(data.totales || { totalFacturado: 0, totalCobrado: 0, totalPorCobrar: 0, count: 0 })
    } catch (e) {
      console.error(e)
      toast.error('Error cargando facturas')
    } finally {
      setLoading(false)
    }
  }, [dateRange, page, pageSize])

  useEffect(() => { fetchFacturas() }, [fetchFacturas])

  const closeFacturaDetail = () => {
    setSelectedFactura(null)
    setFacturaDetail(null)
    setHighlightedFactura(null)
  }

  const selectedClienteId = selection?.type === 'cliente' ? selection.id : null
  const selectedFacturaId = selection?.type === 'factura' ? selection.id : null

  const facturasFiltradas = facturas
    .filter((f) => {
      if (estadoFilter !== 'TODAS' && f.estado !== estadoFilter) return false
      if (selectedClienteId && f.cliente?.id !== selectedClienteId) return false
      if (selectedFacturaId && f.id !== selectedFacturaId) return false
      return true
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortField === 'fecha') {
        return dir * (new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
      }
      if (sortField === 'total') {
        return dir * (Number(a.total) - Number(b.total))
      }
      return dir * (Number(a.saldo) - Number(b.saldo))
    })

  const registrarAbono = async (factura: Factura) => {
    if (!montoAbono) {
      toast.error('Ingresa un monto')
      return
    }
    const monto = parseFloat(montoAbono)
    if (isNaN(monto) || monto <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    if (monto > Number(factura.saldo)) {
      toast.error(`El abono no puede exceder el saldo (${formatCurrency(Number(factura.saldo))})`)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/abonos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facturaId: factura.id,
          clienteId: factura.cliente?.id || '',
          monto,
          metodoPago,
        }),
      })
      if (res.ok) {
        setAbonoFactura(null)
        setMontoAbono('')
        fetchFacturas()
        if (facturaDetail && facturaDetail.id === factura.id) {
          openFacturaDetail(factura.id)
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

  const handleAbonoSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!abonoFactura) return
    await registrarAbono(abonoFactura)
  }

  const handleDateChange = useCallback((desde: string | null, hasta: string | null) => {
    setDateRange({ desde, hasta })
    setPage(1)
  }, [])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'fecha' ? 'desc' : 'asc')
    }
  }

  // KPIs globales del rango de fechas (del backend)
  const kpis = {
    total: totales.totalFacturado,
    cobrado: totales.totalCobrado,
    porCobrar: totales.totalPorCobrar,
    count: totales.count,
    countPendientes: facturasFiltradas.filter(f => f.saldo > 0).length,
    countPagadas: facturasFiltradas.filter(f => f.estado === 'PAGADA').length,
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

  // Evita desfase UTC: fuerza timezone Bogotá para strings YYYY-MM-DD
  const formatDateLocal = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

  const formatClienteNombre = (cliente?: Factura['cliente']) => {
    if (!cliente) return 'N/A'
    const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ')
    if (cliente.nombreNegocio) {
      return `${nombre} — ${cliente.nombreNegocio}`
    }
    return nombre
  }

  const estadoBadgeClass = (estado: string) => {
    switch (estado) {
      case 'PAGADA': return 'bg-green-100 text-green-700 border-green-200'
      case 'EMITIDA': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'ANULADA': return 'bg-gray-100 text-gray-600 border-gray-200'
      default: return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const estadoFilterButtons: { key: EstadoFilter; label: string; count: number }[] = [
    { key: 'TODAS', label: 'Todas', count: facturas.length },
    { key: 'EMITIDA', label: 'Emitidas', count: facturas.filter(f => f.estado === 'EMITIDA').length },
    { key: 'PAGADA', label: 'Pagadas', count: facturas.filter(f => f.estado === 'PAGADA').length },
    { key: 'ANULADA', label: 'Anuladas', count: facturas.filter(f => f.estado === 'ANULADA').length },
  ]

  const clientesUnicos = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; apellido: string | null; telefono: string; direccion: string | null; nombreNegocio: string | null }>()
    facturas.forEach(f => {
      if (f.cliente?.id && !map.has(f.cliente.id)) {
        map.set(f.cliente.id, {
          id: f.cliente.id,
          nombre: f.cliente.nombre,
          apellido: f.cliente.apellido ?? null,
          telefono: f.cliente.telefono ?? '',
          direccion: f.cliente.direccion ?? null,
          nombreNegocio: f.cliente.nombreNegocio ?? null,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [facturas])

  const clienteSeleccionado = selectedClienteId
    ? clientesUnicos.find(c => c.id === selectedClienteId) ?? null
    : null

  const facturaOptions = useMemo(() =>
    facturas.map(f => ({
      id: f.id,
      numero: f.numero,
      clienteNombre: f.cliente ? formatClienteNombre(f.cliente) : null,
      fecha: f.fecha,
    })),
  [facturas])

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-blue-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (loading && facturas.length === 0) {
    return (
      <div className="p-4">
        <SkeletonPage hasStats cardCount={5} />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Facturas</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total facturado</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(kpis.total)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{kpis.count} factura{kpis.count !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total cobrado</p>
          <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(kpis.cobrado)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{kpis.countPagadas} pagada{kpis.countPagadas !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Por cobrar</p>
          <p className="text-lg font-bold text-red-600 mt-1">{formatCurrency(kpis.porCobrar)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{kpis.countPendientes} pendiente{kpis.countPendientes !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Cobranza</p>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${kpis.total > 0 ? Math.round((kpis.cobrado / kpis.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {kpis.total > 0 ? Math.round((kpis.cobrado / kpis.total) * 100) : 0}% cobrado
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {estadoFilterButtons.map(btn => (
            <button
              key={btn.key}
              onClick={() => setEstadoFilter(btn.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition border ${
                estadoFilter === btn.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {btn.label}
              <span className={`ml-1 ${estadoFilter === btn.key ? 'text-blue-100' : 'text-gray-400'}`}>
                ({btn.count})
              </span>
            </button>
          ))}
        </div>
        <DateRangeFilter onDateChange={handleDateChange} />
        <UnifiedSearch
          clientes={clientesUnicos}
          facturas={facturaOptions}
          selection={selection}
          onChange={setSelection}
          placeholder="Buscar cliente o factura..."
        />
      </div>

      {/* Resumen consolidado */}
      {clienteSeleccionado && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <p className="text-sm font-medium text-blue-900">
              {facturasFiltradas.filter(f => f.cliente?.id === clienteSeleccionado.id).length} factura{facturasFiltradas.filter(f => f.cliente?.id === clienteSeleccionado.id).length !== 1 ? 's' : ''} de <span className="font-bold">{clienteSeleccionado.nombre}</span>
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              {dateRange.desde && dateRange.hasta
                ? `Período filtrado: ${formatDateLocal(dateRange.desde)} — ${formatDateLocal(dateRange.hasta)}`
                : 'Sin filtro de fechas. Selecciona un rango para ver el resumen.'
              }
            </p>
          </div>
          {dateRange.desde && dateRange.hasta ? (
            <Link
              href={`/resumen-facturas?clienteId=${clienteSeleccionado.id}&desde=${dateRange.desde}&hasta=${dateRange.hasta}`}
              className="shrink-0"
            >
              <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100 bg-white">
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Ver resumen consolidado
              </Button>
            </Link>
          ) : (
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-100 bg-white shrink-0"
              onClick={() => toast.error('Selecciona un rango de fechas primero')}
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Ver resumen consolidado
            </Button>
          )}
        </div>
      )}

      {/* Lista */}
      {facturasFiltradas.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          title={facturas.length > 0 ? 'No se encontraron facturas' : 'No hay facturas registradas'}
          description={facturas.length > 0 ? 'Ninguna factura coincide con los filtros seleccionados' : 'Las facturas se generan automaticamente al crear pedidos con saldo pendiente'}
        />
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {/* Tabla desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Factura
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleSort('fecha')}>
                    Fecha {sortIcon('fecha')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleSort('total')}>
                    Total {sortIcon('total')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none"
                      onClick={() => handleSort('saldo')}>
                    Saldo {sortIcon('saldo')}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Progreso
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {facturasFiltradas.map((factura) => {
                  const total = Number(factura.total)
                  const saldo = Number(factura.saldo)
                  const pagado = Number(factura.montoPagado || 0)
                  const progreso = total > 0 ? Math.round((pagado / total) * 100) : 0
                  const tieneSaldo = saldo > 0

                  return (
                    <tr
                      key={factura.id}
                      ref={(el) => { if (el) cardRefs.current.set(factura.id, el) }}
                      className={`transition cursor-pointer ${
                        highlightedFactura === factura.id ? 'bg-blue-50 ring-1 ring-blue-200' :
                        tieneSaldo ? 'hover:bg-red-50/40' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => openFacturaDetail(factura.id)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900">#{factura.numero}</span>
                        {factura.pedido && (
                          <div className="mt-0.5">
                            <a
                              href={`/pedidos?openPedido=${factura.pedido.id}`}
                              className="text-xs text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Pedido #{factura.pedido.numero}
                            </a>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {factura.cliente ? (
                          getAnonymousClientDisplayName(factura.cliente.id) ? (
                            <span className="text-sm font-medium text-gray-800">
                              {getAnonymousClientDisplayName(factura.cliente.id, 'short')}
                            </span>
                          ) : (
                            <a
                              href={`/clientes?openCliente=${factura.cliente.id}`}
                              className="text-sm font-medium text-gray-800 hover:text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {formatClienteNombre(factura.cliente)}
                            </a>
                          )
                        ) : (
                          <span className="text-sm text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{formatDate(factura.fecha)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-800">{formatCurrency(total)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {factura.estado === 'ANULADA' ? (
                          <span className="text-xs text-gray-500 font-medium">Anulada</span>
                        ) : tieneSaldo ? (
                          <span className="text-sm font-semibold text-red-600">{formatCurrency(saldo)}</span>
                        ) : (
                          <span className="text-xs text-green-600 font-medium">✓</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {factura.estado === 'ANULADA' ? (
                          <span className="text-[10px] text-gray-400 block text-center">—</span>
                        ) : (
                          <div className="w-full max-w-[100px] mx-auto">
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${progreso === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                style={{ width: `${progreso}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 mt-0.5 block text-center">{progreso}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${estadoBadgeClass(factura.estado)}`}>
                          {factura.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); openFacturaDetail(factura.id) }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Ver detalle"
                            aria-label="Ver detalle"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {tieneSaldo && factura.estado !== 'ANULADA' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setAbonoFactura(factura)
                                setMontoAbono('')
                              }}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition"
                              title="Registrar abono"
                              aria-label="Registrar abono"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="md:hidden space-y-3">
            {facturasFiltradas.map((factura) => {
              const total = Number(factura.total)
              const saldo = Number(factura.saldo)
              const pagado = Number(factura.montoPagado || 0)
              const progreso = total > 0 ? Math.round((pagado / total) * 100) : 0
              const tieneSaldo = saldo > 0

              return (
                <div
                  key={factura.id}
                  ref={(el) => { if (el) cardRefs.current.set(factura.id, el) }}
                  className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm cursor-pointer transition ${
                    highlightedFactura === factura.id ? 'bg-blue-50 ring-1 ring-blue-200' :
                    tieneSaldo ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => openFacturaDetail(factura.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900">#{factura.numero}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${estadoBadgeClass(factura.estado)}`}>
                          {factura.estado}
                        </span>
                      </div>
                      {factura.cliente ? (
                        getAnonymousClientDisplayName(factura.cliente.id) ? (
                          <span className="text-sm font-medium text-gray-800 block truncate">
                            {getAnonymousClientDisplayName(factura.cliente.id, 'short')}
                          </span>
                        ) : (
                          <a
                            href={`/clientes?openCliente=${factura.cliente.id}`}
                            className="text-sm font-medium text-gray-800 hover:text-blue-600 hover:underline block truncate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {formatClienteNombre(factura.cliente)}
                          </a>
                        )
                      ) : (
                        <p className="text-sm text-gray-400">N/A</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(factura.fecha)}</p>
                      {factura.pedido && (
                        <a
                          href={`/pedidos?openPedido=${factura.pedido.id}`}
                          className="text-xs text-blue-600 hover:underline mt-0.5 block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Pedido #{factura.pedido.numero}
                        </a>
                      )}
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className="font-bold text-gray-800 text-sm">{formatCurrency(total)}</p>
                      {factura.estado === 'ANULADA' ? (
                        <p className="text-xs text-gray-500 font-medium">Anulada</p>
                      ) : tieneSaldo ? (
                        <p className="text-xs text-red-600 font-semibold">Saldo: {formatCurrency(saldo)}</p>
                      ) : (
                        <p className="text-xs text-green-600 font-medium">Pagada</p>
                      )}
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  {factura.estado !== 'ANULADA' && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${progreso === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${progreso}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{progreso}% pagado</span>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); openFacturaDetail(factura.id) }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Ver detalle
                    </button>
                    {tieneSaldo && factura.estado !== 'ANULADA' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setAbonoFactura(factura)
                          setMontoAbono('')
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Abonar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">
            Mostrando {facturas.length} de {total} facturas
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Anterior
            </Button>
            <span className="text-sm text-gray-600 px-2">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Siguiente
            </Button>
          </div>
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
                setAbonoFactura(facturaDetail)
                setMontoAbono('')
              }}
            />
          </div>
        ) : null}
      </Modal>

      {/* Modal de abono standalone */}
      <Modal open={!!abonoFactura} onClose={() => setAbonoFactura(null)} className="bg-white rounded-xl w-full max-w-md mx-auto p-0" title="Registrar Abono">
        {abonoFactura && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold">Registrar Abono</h2>
                <p className="text-sm text-gray-500">Factura #{abonoFactura.numero} — {abonoFactura.cliente ? formatClienteNombre(abonoFactura.cliente) : 'N/A'}</p>
              </div>
              <button
                onClick={() => setAbonoFactura(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Info de la factura */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total:</span>
                <span className="font-medium">{formatCurrency(Number(abonoFactura.total))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Saldo pendiente:</span>
                <span className="font-bold text-red-600">{formatCurrency(Number(abonoFactura.saldo))}</span>
              </div>
            </div>

            <form onSubmit={handleAbonoSubmit} className="space-y-3">
              <div>
                <Label htmlFor="monto-abono">Monto del abono</Label>
                <Input
                  id="monto-abono"
                  type="number"
                  min="0"
                  max={Number(abonoFactura.saldo)}
                  required
                  value={montoAbono}
                  onChange={(e) => setMontoAbono(e.target.value)}
                  placeholder="Monto a pagar"
                />
              </div>
              <div>
                <Label htmlFor="metodo-pago">Metodo de pago</Label>
                <select
                  id="metodo-pago"
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
              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Enviando...
                    </span>
                  ) : (
                    'Confirmar'
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => setAbonoFactura(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  )
}
