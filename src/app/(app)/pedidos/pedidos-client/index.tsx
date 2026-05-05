'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { PedidoFilters } from './pedido-filters'
import { PedidoTable } from './pedido-table'
import type { Pedido, Embarque, Cliente } from './types'

const PedidoForm = dynamic(() => import('@/components/pedido-form').then(m => m.PedidoForm), { ssr: false })
const VentaRapidaForm = dynamic(() => import('@/components/venta-rapida-form').then(m => m.VentaRapidaForm), { ssr: false })

export function PedidosClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showVentaRapida, setShowVentaRapida] = useState(false)
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [precios, setPrecios] = useState<Record<string, number>>({})
  const [embarques, setEmbarques] = useState<Embarque[]>([])
  const [showEmbarqueModal, setShowEmbarqueModal] = useState(false)
  const [selectedPedidoForEmbarque, setSelectedPedidoForEmbarque] = useState<string | null>(null)
  const [selectedEmbarqueId, setSelectedEmbarqueId] = useState('')
  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })

  const filtroEstado = searchParams.getAll('estado')
  const filtroTipo = searchParams.getAll('tipo')
  const search = searchParams.get('search') || ''

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    const current = params.getAll(key)
    params.delete(key)
    if (current.includes(value)) {
      current.filter(v => v !== value).forEach(v => params.append(key, v))
    } else {
      params.append(key, value)
    }
    router.push(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const updateSearch = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('search', value)
    else params.delete('search')
    router.push(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const [searchInput, setSearchInput] = useState(search)

  const dateRangeRef = useRef(dateRange)
  dateRangeRef.current = dateRange

  const handleDateChange = useCallback((desde: string | null, hasta: string | null) => {
    setDateRange({ desde, hasta })
  }, [])

  const fetchPedidos = useCallback(async () => {
    try {
      setFetchError(null)
      const dr = dateRangeRef.current
      const params = new URLSearchParams()
      if (dr.desde && dr.hasta) {
        params.set('desde', dr.desde)
        params.set('hasta', dr.hasta)
      } else {
        params.set('all', 'true')
      }
      const res = await fetch(`/api/pedidos?${params.toString()}`)
      const data = await res.json()
      setPedidos(data.pedidos || data.data || [])
    } catch (error) {
      console.error('Error fetching pedidos:', error)
      setFetchError('No se pudieron cargar los pedidos')
      toast.error('Error cargando pedidos')
    } finally {
      setLoading(false)
    }
  }, [])

  async function fetchClientes() {
    try {
      const res = await fetch('/api/clientes?all=true')
      const data = await res.json()
      setClientes(data.clientes || data.data || [])
    } catch (error) {
      console.error('Error fetching clientes:', error)
      toast.error('Error cargando clientes')
    }
  }

  async function fetchPrecios() {
    try {
      const res = await fetch('/api/precios')
      const data = await res.json()
      const map: Record<string, number> = {}
      for (const p of data.precios || data.data || []) {
        map[p.producto] = Number(p.precio)
      }
      setPrecios(map)
    } catch (error) {
      console.error('Error fetching precios:', error)
      toast.error('Error cargando precios')
    }
  }

  async function fetchEmbarques() {
    try {
      const res = await fetch('/api/embarques')
      const data = await res.json()
      setEmbarques((data.embarques || data.data || []).filter((e: Embarque) => e.estado === 'ABIERTO'))
    } catch (error) {
      console.error('Error fetching embarques:', error)
    }
  }

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        updateSearch(searchInput)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, search, updateSearch])

  useEffect(() => {
    fetchPedidos()
    Promise.all([fetchClientes(), fetchPrecios(), fetchEmbarques()])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch pedidos when dateRange changes
  useEffect(() => {
    if (dateRange.desde || dateRange.hasta) {
      fetchPedidos()
    }
  }, [dateRange.desde, dateRange.hasta, fetchPedidos])

  useEffect(() => {
    let isFetching = false
    const interval = setInterval(() => {
      if (!isFetching) {
        isFetching = true
        fetchPedidos().finally(() => { isFetching = false })
      }
      }, 60000) // Poll every 60s instead of 15s — 6 users don't need aggressive polling
    return () => clearInterval(interval)
  }, [fetchPedidos])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPedidos()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchPedidos])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleCrearPedido(pedidoData: any) {
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pedidoData),
      })
      if (res.ok) {
        setShowModal(false)
        fetchPedidos()
        toast.success('Pedido creado exitosamente')
      } else {
        const err = await res.json()
        toast.error(err.error?.formErrors?.[0] || 'Error creando pedido')
      }
    } catch (error) {
      console.error('Error creating pedido:', error)
      toast.error('Error creando pedido')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleVentaRapida(data: any) {
    try {
      const pedidoData = {
        clienteId: data.clienteId || 'CLIENTE_MOSTRADOR',
        canal: data.canal,
        productos: data.productos,
        pagos: data.pagos,
        obs: data.obs,
        clienteNuevo: data.clienteNuevo,
        ventaRapida: true,
        tipo: data.tipo,
      }

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pedidoData),
      })

      if (res.ok) {
        setShowVentaRapida(false)
        fetchPedidos()
        const msg = data.pagos.length === 0
          ? `Venta registrada (pendiente): $${data.total.toLocaleString()}`
          : `Venta cobrada: $${data.total.toLocaleString()}`
        toast.success(msg)
      } else {
        const err = await res.json()
        toast.error(err.error?.formErrors?.[0] || 'Error procesando venta')
      }
    } catch (error) {
      console.error('Error venta rápida:', error)
      toast.error('Error procesando venta')
    }
  }

  const pedidosFiltrados = useMemo(() => pedidos.filter((p) => {
    const matchEstado = filtroEstado.length === 0 || filtroEstado.includes(p.estado)
    const matchTipo = filtroTipo.length === 0 || filtroTipo.includes(p.tipo)
    const matchSearch =
      !search ||
      p.nombreCli.toLowerCase().includes(search.toLowerCase()) ||
      p.telefonoCli?.includes(search) ||
      p.numero.toString().includes(search)
    return matchEstado && matchTipo && matchSearch
  }), [pedidos, filtroEstado, filtroTipo, search])

  const totalVentas = useMemo(() => pedidos.reduce((acc, p) => acc + Number(p.total || 0), 0), [pedidos])
  const totalFiado = useMemo(() => pedidos
    .filter(p => Number(p.saldo) > 0)
    .reduce((acc, p) => acc + Number(p.saldo), 0), [pedidos])

  const hasActiveFilters = !!(search || filtroEstado.length > 0 || filtroTipo.length > 0)

  function getEstadoBadge(pedido: Pedido) {
    if (pedido.estado === 'PENDIENTE') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          PENDIENTE
        </span>
      )
    }
    if (pedido.estado === 'EN_RUTA') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          EN RUTA
        </span>
      )
    }

    if (pedido.estado === 'ENTREGADO') {
      const saldo = Number(pedido.saldo)
      const totalPagado = Number(pedido.totalPagado)

      if (saldo === 0) {
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            PAGADO
          </span>
        )
      }
      if (totalPagado > 0 && saldo > 0) {
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            PAGO PARCIAL
          </span>
        )
      }
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          POR COBRAR
        </span>
      )
    }

    if (pedido.estado === 'CANCELADO' || pedido.estado === 'ANULADO') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          {pedido.estado}
        </span>
      )
    }

    return null
  }

  function getTipoBadge(tipo: string) {
    const styles: Record<string, string> = {
      ENVIO: 'bg-indigo-100 text-indigo-700',
      PUNTO: 'bg-emerald-100 text-emerald-700',
    }
    const labels: Record<string, string> = { ENVIO: 'Envío', PUNTO: 'Punto' }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[tipo] || 'bg-gray-100 text-gray-500'}`}>
        {labels[tipo] || tipo}
      </span>
    )
  }

  function tieneFiado(pedido: Pedido): boolean {
    return pedido.estado === 'ENTREGADO' && Number(pedido.saldo) > 0
  }

  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function cambiarEstado(id: string, nuevoEstado: string) {
    if (updatingId) return

    if (nuevoEstado === 'EN_RUTA') {
      setShowDetailModal(false)
      setSelectedPedidoForEmbarque(id)
      setSelectedEmbarqueId('')
      setShowEmbarqueModal(true)
      return
    }

    setUpdatingId(id)
    try {
      const res = await fetch(`/api/pedidos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (res.ok) {
        setShowDetailModal(false)
        fetchPedidos()
        toast.success(`Estado actualizado a ${nuevoEstado}`)
      } else {
        toast.error('Error actualizando estado')
      }
    } catch (error) {
      console.error('Error cambiando estado:', error)
      toast.error('Error actualizando estado')
    } finally {
      setUpdatingId(null)
    }
  }

  async function asignarEmbarque() {
    if (!selectedPedidoForEmbarque || !selectedEmbarqueId) return
    setUpdatingId(selectedPedidoForEmbarque)
    try {
      const res = await fetch(`/api/pedidos/${selectedPedidoForEmbarque}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embarqueId: selectedEmbarqueId }),
      })
      if (res.ok) {
        toast.success('Pedido enviado y asignado a embarque')
        fetchPedidos()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al enviar pedido')
      }
    } catch (error) {
      console.error('Error asignando embarque:', error)
      toast.error('Error asignando embarque')
    } finally {
      setUpdatingId(null)
      setShowEmbarqueModal(false)
      setSelectedPedidoForEmbarque(null)
      setSelectedEmbarqueId('')
    }
  }

  function handleDetail(pedido: Pedido) {
    setSelectedPedido(pedido)
    setShowDetailModal(true)
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900">{fetchError}</h3>
        <button
          onClick={() => { setLoading(true); fetchPedidos(); fetchClientes(); fetchPrecios(); fetchEmbarques(); }}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          Reintentar
        </button>
      </div>
    )
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
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Pedidos del Dia</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowVentaRapida(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
          >
            $ Venta Rapida
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            + Nuevo Pedido
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Total Pedidos</p>
          <p className="text-2xl font-bold text-gray-800">{pedidos.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Ventas</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalVentas)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Fiados</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalFiado)}</p>
        </div>
      </div>

      {/* Filtros */}
      <PedidoFilters
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        filtroEstado={filtroEstado}
        filtroTipo={filtroTipo}
        onUpdateFilter={updateFilter}
        onDateChange={handleDateChange}
      />
      {/* Modal Nuevo Pedido */}
      <Modal open={showModal} onClose={() => setShowModal(false)} className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Nuevo Pedido</h2>
          <button
            onClick={() => setShowModal(false)}
            className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <PedidoForm
            clientes={clientes}
            precios={precios}
            onSubmit={handleCrearPedido}
          />
        </div>
      </Modal>

      {/* Modal Venta Rápida */}
      <Modal open={showVentaRapida} onClose={() => setShowVentaRapida(false)} className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-green-50">
          <h2 className="text-xl font-bold text-green-800">$ Venta Rapida</h2>
          <button
            onClick={() => setShowVentaRapida(false)}
            className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <VentaRapidaForm
            precios={precios}
            clientes={clientes}
            onSubmit={handleVentaRapida}
          />
        </div>
      </Modal>

      {/* Pedidos Table */}
      <PedidoTable
        pedidos={pedidosFiltrados}
        updatingId={updatingId}
        hasActiveFilters={hasActiveFilters}
        renderEstadoBadge={getEstadoBadge}
        renderTipoBadge={getTipoBadge}
        tieneFiado={tieneFiado}
        onDetail={handleDetail}
        onCambiarEstado={cambiarEstado}
        onCreateClick={() => setShowModal(true)}
      />

      {/* Modal Asignar Embarque */}
      <Modal open={showEmbarqueModal} onClose={() => { setShowEmbarqueModal(false); setSelectedPedidoForEmbarque(null) }} className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold mb-4">Asignar a Embarque</h2>
        <p className="text-sm text-gray-500 mb-4">Selecciona un embarque abierto para este pedido:</p>
        {(() => {
          const pedidoPacas = selectedPedidoForEmbarque ? pedidos.find((p) => p.id === selectedPedidoForEmbarque) : null
          const pedidoPacaCount = pedidoPacas ? (pedidoPacas.cPacaAguaPed || 0) + (pedidoPacas.cPacaHieloPed || 0) + (pedidoPacas.cBotellonFabPed || 0) + (pedidoPacas.cBotellonDomPed || 0) + (pedidoPacas.cBolsaAguaPed || 0) + (pedidoPacas.cBolsaHieloPed || 0) : 0
          const embarquesDisponibles = embarques.filter((e) => e.estado === 'ABIERTO' && (e.totalPacas || 0) + pedidoPacaCount <= 70)
          const embarquesLlenos = embarques.filter((e) => e.estado === 'ABIERTO' && (e.totalPacas || 0) + pedidoPacaCount > 70)

          if (embarquesDisponibles.length === 0 && embarquesLlenos.length === 0) {
            return (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-2">No hay embarques abiertos</p>
                <p className="text-xs text-gray-400">Crea un embarque primero para poder enviar este pedido</p>
              </div>
            )
          }

          return (
            <div className="space-y-3">
              {embarquesDisponibles.length === 0 && embarquesLlenos.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  Todos los embarques abiertos están llenos (70 pacas). Crea un nuevo embarque.
                </div>
              )}
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {embarquesDisponibles.map((e) => {
                  const capacidad = e.totalPacas || 0
                  const capacidadLabel = capacidad >= 70 ? '⛔ Excedido' : capacidad >= 65 ? '🔴 Máximo' : capacidad >= 60 ? '🟠 Pesado' : '🟢 Ideal'
                  const isSelected = selectedEmbarqueId === e.id
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedEmbarqueId(e.id)}
                      className={`w-full text-left p-3 border-b last:border-b-0 transition ${
                        isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium">#{e.numero}</span>
                          <span className="text-gray-600 ml-2">{e.trabajador.nombre}</span>
                          {e.ruta && <span className="text-blue-600 text-xs ml-2">{e.ruta.nombre}</span>}
                        </div>
                        <span className="text-xs">{capacidadLabel} ({capacidad})</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {selectedEmbarqueId && (() => {
                const e = embarques.find((em) => em.id === selectedEmbarqueId)
                if (!e) return null
                const totalProyectado = (e.totalPacas || 0) + pedidoPacaCount
                if (totalProyectado >= 70) {
                  return <p className="text-xs text-red-600">⚠️ Este pedido excederá la capacidad (70 pacas)</p>
                }
                return null
              })()}
              {!selectedEmbarqueId && embarquesDisponibles.length > 0 && (
                <p className="text-xs text-amber-600">Selecciona un embarque para continuar</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowEmbarqueModal(false); setSelectedPedidoForEmbarque(null) }}
                  className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={asignarEmbarque}
                  disabled={updatingId === selectedPedidoForEmbarque || !selectedEmbarqueId}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updatingId === selectedPedidoForEmbarque ? 'Enviando...' : 'Confirmar Envío'}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal Detalle */}
      <Modal open={showDetailModal && !!selectedPedido} onClose={() => setShowDetailModal(false)} className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {selectedPedido && (
          <>
            <div className="p-4 border-b flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-400">#{selectedPedido.numero}</span>
                  {getEstadoBadge(selectedPedido)}
                  {getTipoBadge(selectedPedido.tipo)}
                </div>
                <h2 className="text-lg font-bold text-gray-800">{selectedPedido.nombreCli}</h2>
                <p className="text-sm text-gray-500">{selectedPedido.telefonoCli}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition" aria-label="Cerrar">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">Total Pedido</span>
                  <span className="text-2xl font-bold text-gray-800">{formatCurrency(Number(selectedPedido.total))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Pagado:</span>
                  <span className="font-medium text-green-600">{formatCurrency(Number(selectedPedido.totalPagado))}</span>
                </div>
                {selectedPedido.estado === 'ENTREGADO' && Number(selectedPedido.saldo) > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Pendiente:</span>
                    <span className="font-medium text-red-600">{formatCurrency(Number(selectedPedido.saldo))}</span>
                  </div>
                )}
                {selectedPedido.estado === 'ENTREGADO' && Number(selectedPedido.saldo) <= 0 && Number(selectedPedido.totalPagado) > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Estado:</span>
                    <span className="font-medium text-green-600">Pagado completo</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Tipo</div>
                  <div className="font-medium text-gray-700">{selectedPedido.tipo}</div>
                </div>
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Fecha</div>
                  <div className="font-medium text-gray-700">{new Date(selectedPedido.fecha).toLocaleDateString('es-CO')}</div>
                </div>
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Hora</div>
                  <div className="font-medium text-gray-700">{new Date(selectedPedido.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                {selectedPedido.estado === 'EN_RUTA' && selectedPedido.embarqueId && (
                  <div className="bg-white border rounded-lg p-2.5">
                    <div className="text-xs text-gray-400 mb-0.5">Embarque</div>
                    <div className="font-medium text-gray-700">#{embarques.find(e => e.id === selectedPedido.embarqueId)?.numero || selectedPedido.embarqueId}</div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Productos</h3>
                <div className="space-y-2">
                  {selectedPedido.cPacaAguaPed > 0 && (
                    <div className="flex justify-between items-center bg-blue-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>🍶</span>
                        <span className="text-sm font-medium">Paca Agua</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{selectedPedido.cPacaAguaPed} und</div>
                        <div className="text-xs text-gray-500">${formatCurrency(Number(selectedPedido.precioPacaAgua))} c/u</div>
                      </div>
                    </div>
                  )}
                  {selectedPedido.cPacaHieloPed > 0 && (
                    <div className="flex justify-between items-center bg-cyan-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>🧊</span>
                        <span className="text-sm font-medium">Paca Hielo</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{selectedPedido.cPacaHieloPed} und</div>
                        <div className="text-xs text-gray-500">${formatCurrency(Number(selectedPedido.precioPacaHielo))} c/u</div>
                      </div>
                    </div>
                  )}
                  {selectedPedido.cBotellonFabPed > 0 && (
                    <div className="flex justify-between items-center bg-indigo-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>🏭</span>
                        <span className="text-sm font-medium">Botellón Fábrica</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{selectedPedido.cBotellonFabPed} und</div>
                        <div className="text-xs text-gray-500">${formatCurrency(Number(selectedPedido.precioBotellonFab))} c/u</div>
                      </div>
                    </div>
                  )}
                  {selectedPedido.cBotellonDomPed > 0 && (
                    <div className="flex justify-between items-center bg-purple-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>🏠</span>
                        <span className="text-sm font-medium">Botellón Domicilio</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{selectedPedido.cBotellonDomPed} und</div>
                        <div className="text-xs text-gray-500">${formatCurrency(Number(selectedPedido.precioBotellonDom))} c/u</div>
                      </div>
                    </div>
                  )}
                  {selectedPedido.cBolsaAguaPed > 0 && (
                    <div className="flex justify-between items-center bg-sky-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>💧</span>
                        <span className="text-sm font-medium">Bolsa Agua</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{selectedPedido.cBolsaAguaPed} und</div>
                        <div className="text-xs text-gray-500">${formatCurrency(Number(selectedPedido.precioBolsaAgua))} c/u</div>
                      </div>
                    </div>
                  )}
                  {selectedPedido.cBolsaHieloPed > 0 && (
                    <div className="flex justify-between items-center bg-teal-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>❄️</span>
                        <span className="text-sm font-medium">Bolsa Hielo</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{selectedPedido.cBolsaHieloPed} und</div>
                        <div className="text-xs text-gray-500">${formatCurrency(Number(selectedPedido.precioBolsaHielo))} c/u</div>
                      </div>
                    </div>
                  )}
                  {selectedPedido.cPacaAguaPed === 0 && selectedPedido.cPacaHieloPed === 0 && selectedPedido.cBotellonFabPed === 0 && selectedPedido.cBotellonDomPed === 0 && selectedPedido.cBolsaAguaPed === 0 && selectedPedido.cBolsaHieloPed === 0 && (
                    <div className="text-sm text-gray-400 text-center py-2">Sin productos</div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Estado</h3>
                <div className="flex gap-2">
                  {['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO'].map((est) => {
                    const isActive = selectedPedido.estado === est
                    const isPast = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO'].indexOf(selectedPedido.estado) >= ['PENDIENTE', 'EN_RUTA', 'ENTREGADO'].indexOf(est)
                    const styles: Record<string, string> = {
                      PENDIENTE: isActive ? 'bg-yellow-500 text-white' : isPast ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400',
                      EN_RUTA: isActive ? 'bg-blue-500 text-white' : isPast ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400',
                      ENTREGADO: isActive ? 'bg-green-500 text-white' : isPast ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400',
                      CANCELADO: isActive ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-400',
                      ANULADO: isActive ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400',
                    }
                    const labels: Record<string, string> = { PENDIENTE: 'Pendiente', EN_RUTA: 'En Ruta', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado', ANULADO: 'Anulado' }
                    const transicionesValidas: Record<string, string[]> = {
                      PENDIENTE: ['EN_RUTA', 'CANCELADO'],
                      EN_RUTA: ['ENTREGADO', 'PENDIENTE', 'CANCELADO'],
                      ENTREGADO: ['ANULADO'],
                      CANCELADO: [],
                      ANULADO: [],
                    }
                    const isClickable = transicionesValidas[selectedPedido.estado].includes(est)
                    return (
                      <button
                        key={est}
                        onClick={() => {
                          if (isClickable) {
                            cambiarEstado(selectedPedido.id, est)
                          }
                        }}
                        disabled={!isClickable || updatingId === selectedPedido.id}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${styles[est]} ${est === selectedPedido.estado ? 'cursor-default' : isClickable ? 'hover:opacity-80 cursor-pointer' : 'cursor-not-allowed'} disabled:opacity-50`}
                      >
                        {updatingId === selectedPedido.id && est !== selectedPedido.estado ? '...' : labels[est]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
