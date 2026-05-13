'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { Modal } from '@/components/modal'
import { ErrorState } from '@/components/error-state'
import { SkeletonPage } from '@/components/skeleton'
import { Tooltip, InfoBanner } from '@/components/tooltip'
import { useConfirm } from '@/components/confirm-modal'
import { PedidoFilters } from './pedido-filters'
import { PedidoTable } from './pedido-table'
import { FiadosTable } from './fiados-table'
import { AlertasTable } from './alertas-table'
import { calcularAlertas } from './alertas-utils'
import type { Pedido, Embarque, Cliente } from './types'

const PedidoFormUnified = dynamic(() => import('@/components/pedido-form-unified').then(m => m.PedidoFormUnified), { ssr: false })

export function PedidosClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { confirm, modal: confirmModal } = useConfirm()
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
  const [activeTab, setActiveTab] = useState<'hoy' | 'fiados' | 'alertas'>('hoy')
  const [fabOpen, setFabOpen] = useState(false)

  // Fechas desde URL (fuente de verdad)
  const desdeUrl = searchParams.get('desde')
  const hastaUrl = searchParams.get('hasta')

  // Navegar a una fecha específica actualizando la URL
  const navigateToDate = useCallback((offset: number) => {
    const fecha = getFechaOffset(offset)
    const params = new URLSearchParams(searchParams.toString())
    params.set('desde', fecha)
    params.set('hasta', fecha)
    router.push(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  // Limpiar filtro de fecha (ver todos)
  const verTodos = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('desde')
    params.delete('hasta')
    router.push(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const filtroTipo = searchParams.getAll('tipo')
  const filtroOrigen = searchParams.getAll('origen')
  const filtroEstadoEntrega = searchParams.getAll('estadoEntrega')
  const filtroEstadoPago = searchParams.getAll('estadoPago')
  const search = searchParams.get('search') || ''
  const openPedidoParam = searchParams.get('openPedido')

  // Auto-open pedido from URL param
  useEffect(() => {
    if (!openPedidoParam || pedidos.length === 0) return
    const pedido = pedidos.find(p => p.id === openPedidoParam || p.numero.toString() === openPedidoParam)
    if (pedido) {
      handleDetail(pedido)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('openPedido')
      router.replace(`?${params.toString()}`, { scroll: false })
    }
  }, [openPedidoParam, pedidos])

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

  const fetchPedidos = useCallback(async () => {
    try {
      setFetchError(null)
      const res = await fetch('/api/pedidos?all=true', { credentials: 'include' })
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
      const res = await fetch('/api/clientes?all=true', { credentials: 'include' })
      const data = await res.json()
      setClientes(data.clientes || data.data || [])
    } catch (error) {
      console.error('Error fetching clientes:', error)
      toast.error('Error cargando clientes')
    }
  }

  async function fetchPrecios() {
    try {
      const res = await fetch('/api/precios', { credentials: 'include' })
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
      const res = await fetch('/api/embarques', { credentials: 'include' })
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

  // Carga inicial
  useEffect(() => {
    fetchPedidos()
    Promise.all([fetchClientes(), fetchPrecios(), fetchEmbarques()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  async function handlePedidoSubmit(data: any) {
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (res.ok) {
        setShowModal(false)
        setShowVentaRapida(false)
        fetchPedidos()
        const msg = data.ventaRapida
          ? (data.pagos?.length === 0 ? `Venta registrada (pendiente)` : `Venta cobrada`)
          : 'Pedido creado exitosamente'
        toast.success(msg)
      } else {
        const err = await res.json()
        toast.error(err.error?.formErrors?.[0] || 'Error creando pedido')
      }
    } catch (error) {
      console.error('Error creating pedido:', error)
      toast.error('Error creando pedido')
    }
  }

  const pedidosFiltrados = useMemo(() => pedidos.filter((p) => {
    const matchTipo = filtroTipo.length === 0 || filtroTipo.includes(p.tipo)
    const matchOrigen = filtroOrigen.length === 0 || filtroOrigen.includes(p.origen)
    const matchEstadoEntrega = filtroEstadoEntrega.length === 0 || filtroEstadoEntrega.includes(p.estadoEntrega)
    const matchEstadoPago = filtroEstadoPago.length === 0 || filtroEstadoPago.includes(p.estadoPago)
    const matchSearch =
      !search ||
      p.nombreCli.toLowerCase().includes(search.toLowerCase()) ||
      p.telefonoCli?.includes(search) ||
      p.numero.toString().includes(search)
    const matchFecha = !desdeUrl || !hastaUrl || (p.fecha >= desdeUrl && p.fecha <= hastaUrl + 'T23:59:59')
    return matchTipo && matchOrigen && matchEstadoEntrega && matchEstadoPago && matchSearch && matchFecha
  }), [pedidos, filtroTipo, filtroOrigen, filtroEstadoEntrega, filtroEstadoPago, search, desdeUrl, hastaUrl])

  const totalVentas = useMemo(() => pedidosFiltrados.reduce((acc, p) => acc + Number(p.total || 0), 0), [pedidosFiltrados])
  const totalFiado = useMemo(() => pedidosFiltrados
    .filter(p => Number(p.saldo) > 0)
    .reduce((acc, p) => acc + Number(p.saldo), 0), [pedidosFiltrados])
  const alertasCount = useMemo(() => calcularAlertas(pedidos).length, [pedidos])

  const hasActiveFilters = !!(search || filtroTipo.length > 0 || filtroOrigen.length > 0 || filtroEstadoEntrega.length > 0 || filtroEstadoPago.length > 0 || desdeUrl || hastaUrl)

  function getOrigenBadge(origen: string) {
    const styles: Record<string, string> = {
      PEDIDO: 'bg-violet-100 text-violet-700',
      VENTA_RAPIDA: 'bg-fuchsia-100 text-fuchsia-700',
      VENTA_LIBRE: 'bg-rose-100 text-rose-700',
    }
    const labels: Record<string, string> = {
      PEDIDO: 'Pedido',
      VENTA_RAPIDA: 'Venta Rápida',
      VENTA_LIBRE: 'Venta Libre',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[origen] || 'bg-gray-100 text-gray-500'}`}>
        {labels[origen] || origen}
      </span>
    )
  }

  function getEstadoEntregaBadge(estado: string) {
    const styles: Record<string, string> = {
      PENDIENTE: 'bg-yellow-100 text-yellow-800',
      EN_RUTA: 'bg-sky-100 text-sky-800',
      ENTREGADO: 'bg-green-100 text-green-800',
      NO_ENTREGADO: 'bg-orange-100 text-orange-800',
      CANCELADO: 'bg-gray-100 text-gray-600',
      ANULADO: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[estado] || 'bg-gray-100 text-gray-500'}`}>
        {estado.replace('_', ' ')}
      </span>
    )
  }

  function getEstadoPagoBadge(estado: string) {
    const styles: Record<string, string> = {
      PENDIENTE: 'bg-red-100 text-red-800',
      PARCIAL: 'bg-amber-100 text-amber-800',
      PAGADO: 'bg-green-100 text-green-800',
      ANTICIPADO: 'bg-teal-100 text-teal-800',
      VENCIDO: 'bg-rose-100 text-rose-800',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[estado] || 'bg-gray-100 text-gray-500'}`}>
        {estado}
      </span>
    )
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
    return pedido.estadoEntrega === 'ENTREGADO' && Number(pedido.saldo) > 0
  }

  function getAlertasPedido(pedido: Pedido): Array<{ tipo: string; label: string; severidad: string }> {
    const alertas: Array<{ tipo: string; label: string; severidad: string }> = []
    const hoy = new Date().toISOString().slice(0, 10)
    const pedidoFecha = pedido.fecha?.slice(0, 10)

    // 2do / 3ro pedido hoy
    if (pedidoFecha === hoy) {
      const pedidosHoyCliente = pedidos.filter(
        p => p.clienteId === pedido.clienteId && p.fecha?.slice(0, 10) === hoy
      )
      if (pedidosHoyCliente.length >= 3) {
        alertas.push({ tipo: '3RO_PEDIDO', label: '3ro+ pedido hoy', severidad: 'MEDIA' })
      } else if (pedidosHoyCliente.length === 2) {
        alertas.push({ tipo: '2DO_PEDIDO', label: '2do pedido hoy', severidad: 'BAJA' })
      }
    }

    // Disputa abierta
    if (pedido.disputaAbierta) {
      alertas.push({ tipo: 'DISPUTA_ABIERTA', label: 'Disputa abierta', severidad: 'ALTA' })
    }

    // Cliente bloqueado (VENCIDO)
    if (pedido.estadoPago === 'VENCIDO') {
      alertas.push({ tipo: 'CLIENTE_BLOQUEADO', label: 'Pago vencido', severidad: 'ALTA' })
    }

    // Monto anómalo
    const promedio = calcularPromedioCliente(pedido.clienteId)
    if (promedio > 0 && Number(pedido.total) > promedio * 2) {
      alertas.push({ tipo: 'MONTO_ANOMALO', label: 'Monto anómalo', severidad: 'ALTA' })
    }

    return alertas
  }

  function calcularPromedioCliente(clienteId: string): number {
    const validos = pedidos.filter(
      (p) => p.clienteId === clienteId && p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO'
    )
    if (validos.length === 0) return 0
    const total = validos.reduce((acc, p) => acc + Number(p.total), 0)
    return total / validos.length
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

    // Confirmaciones con contexto para acciones destructivas
    if (nuevoEstado === 'CANCELADO') {
      const ok = await confirm({
        title: 'Cancelar pedido',
        message: '¿Estás seguro de cancelar este pedido?',
        description: 'El pedido se marcará como cancelado y no se podrá revertir.',
        consequences: [
          'El pedido no se enviará',
          'Se liberará el stock reservado',
          'No se generará factura',
        ],
        variant: 'warning',
        confirmLabel: 'Sí, cancelar',
        cancelLabel: 'No, mantener',
      })
      if (!ok) return
    }

    if (nuevoEstado === 'ANULADO') {
      const ok = await confirm({
        title: 'Anular pedido entregado',
        message: '¿Estás seguro de anular este pedido?',
        description: 'Esta acción es irreversible y afectará el historial de ventas.',
        consequences: [
          'Se creará una nota de crédito',
          'El saldo se marcará como perdido',
          'Afectará los reportes de ventas',
        ],
        variant: 'destructive',
        confirmLabel: 'Sí, anular',
        cancelLabel: 'No, mantener',
      })
      if (!ok) return
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
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.error || 'Error actualizando estado')
      }
    } catch (error) {
      console.error('Error cambiando estado:', error)
      toast.error('Error de conexión. Verifica tu internet e intenta de nuevo.')
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
      <ErrorState
        title="No se pudieron cargar los pedidos"
        message={fetchError}
        errorCode="FETCH_PEDIDOS_ERROR"
        onRetry={() => { setLoading(true); fetchPedidos(); fetchClientes(); fetchPrecios(); fetchEmbarques(); }}
        recoveryActions={[
          {
            label: 'Verificar conexión',
            onClick: () => window.location.reload(),
            variant: 'outline',
          },
        ]}
      />
    )
  }

  if (loading) {
    return <SkeletonPage hasStats hasFilters cardCount={4} />
  }

  return (
    <div>
      {/* Header con tabs */}
      <div className="mb-6">
        {/* Banner explicativo para nuevos usuarios */}
        {pedidos.length === 0 && !hasActiveFilters && (
          <InfoBanner type="tip" title="¿Cómo funciona el flujo de pedidos?" className="mb-4">
            <ol className="list-decimal list-inside space-y-1 mt-1">
              <li><strong>Crea un pedido</strong> con los productos y cliente</li>
              <li><strong>Envía el pedido</strong> a un embarque para entrega</li>
              <li><strong>Marca como entregado</strong> cuando el cliente reciba</li>
              <li><strong>Registra el pago</strong> si queda saldo pendiente</li>
            </ol>
          </InfoBanner>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h1 className="text-2xl font-bold text-gray-800">
            {activeTab === 'fiados' ? 'Fiados' : activeTab === 'alertas' ? 'Alertas' : getTituloFecha(desdeUrl, hastaUrl)}
          </h1>
          {activeTab === 'hoy' && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => verTodos()}
                className={`px-3 py-1.5 rounded-lg transition ${!desdeUrl && !hastaUrl ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Todos
              </button>
              <button
                onClick={() => navigateToDate(-1)}
                className={`px-3 py-1.5 rounded-lg transition ${desdeUrl === getFechaOffset(-1) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                ← Ayer
              </button>
              <button
                onClick={() => navigateToDate(0)}
                className={`px-3 py-1.5 rounded-lg transition ${desdeUrl === getFechaOffset(0) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Hoy
              </button>
              <button
                onClick={() => navigateToDate(1)}
                className={`px-3 py-1.5 rounded-lg transition ${desdeUrl === getFechaOffset(1) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Mañana →
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { key: 'hoy', label: 'Pedidos', count: pedidosFiltrados.length },
            { key: 'fiados', label: 'Fiados', count: pedidos.filter((p) => Number(p.saldo) > 0).length },
            { key: 'alertas', label: 'Alertas', count: alertasCount },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold text-white bg-gray-400 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stats - solo en Hoy */}
      {activeTab === 'hoy' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-sm text-gray-500">Total Pedidos</p>
            <p className="text-2xl font-bold text-gray-800">{pedidosFiltrados.length}</p>
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
      )}

      {/* Filtros - solo en Hoy (fuente de verdad URL) */}
      {activeTab === 'hoy' && (
        <PedidoFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          filtroTipo={filtroTipo}
          filtroOrigen={filtroOrigen}
          filtroEstadoEntrega={filtroEstadoEntrega}
          filtroEstadoPago={filtroEstadoPago}
          onUpdateFilter={updateFilter}
        />
      )}

      {/* Contenido por tab */}
      {activeTab === 'hoy' && (
        <PedidoTable
          pedidos={pedidosFiltrados}
          updatingId={updatingId}
          hasActiveFilters={hasActiveFilters}
          renderOrigenBadge={getOrigenBadge}
          renderEstadoEntregaBadge={getEstadoEntregaBadge}
          renderEstadoPagoBadge={getEstadoPagoBadge}
          getAlertasPedido={getAlertasPedido}
          tieneFiado={tieneFiado}
          onDetail={handleDetail}
          onCambiarEstado={cambiarEstado}
          onCreateClick={() => setShowModal(true)}
        />
      )}
      {activeTab === 'fiados' && <FiadosTable pedidos={pedidos} onPedidosChange={fetchPedidos} />}
      {activeTab === 'alertas' && <AlertasTable pedidos={pedidos} />}

      {/* Modal Formulario Unificado */}
      <Modal open={showModal || showVentaRapida} onClose={() => { setShowModal(false); setShowVentaRapida(false) }} className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className={`p-4 border-b flex justify-between items-center ${showVentaRapida ? 'bg-green-50' : 'bg-blue-50'}`}>
          <h2 className={`text-xl font-bold ${showVentaRapida ? 'text-green-800' : 'text-blue-800'}`}>
            {showVentaRapida ? '💰 Venta Rápida' : '📦 Nuevo Pedido'}
          </h2>
          <button
            onClick={() => { setShowModal(false); setShowVentaRapida(false) }}
            className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <PedidoFormUnified
            contexto={showVentaRapida ? 'PUNTO' : 'DOMICILIO'}
            precios={precios}
            clientes={clientes}
            onSubmit={handlePedidoSubmit}
            onClose={() => { setShowModal(false); setShowVentaRapida(false) }}
          />
        </div>
      </Modal>

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
                  {getEstadoEntregaBadge(selectedPedido.estadoEntrega)}
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
                {selectedPedido.estadoEntrega === 'ENTREGADO' && Number(selectedPedido.saldo) > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Pendiente:</span>
                    <span className="font-medium text-red-600">{formatCurrency(Number(selectedPedido.saldo))}</span>
                  </div>
                )}
                {selectedPedido.estadoEntrega === 'ENTREGADO' && Number(selectedPedido.saldo) <= 0 && Number(selectedPedido.totalPagado) > 0 && (
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
                {selectedPedido.estadoEntrega === 'EN_RUTA' && selectedPedido.embarqueId && (
                  <div className="bg-white border rounded-lg p-2.5">
                    <div className="text-xs text-gray-400 mb-0.5">Embarque</div>
                    <div className="font-medium text-gray-700">#{embarques.find(e => e.id === selectedPedido.embarqueId)?.numero || selectedPedido.embarqueId}</div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Productos</h3>
                <div className="space-y-2">
                  {(() => {
                    const ITEM_BG: Record<string, string> = {
                      PACA_AGUA: 'bg-blue-50',
                      PACA_HIELO: 'bg-cyan-50',
                      BOTELLON_FAB: 'bg-indigo-50',
                      BOTELLON_DOM: 'bg-purple-50',
                      BOLSA_AGUA: 'bg-sky-50',
                      BOLSA_HIELO: 'bg-teal-50',
                    }
                    const legacyMap: Record<string, { cant: number; precio: number }> = {
                      PACA_AGUA: { cant: selectedPedido.cPacaAguaPed, precio: Number(selectedPedido.precioPacaAgua) },
                      PACA_HIELO: { cant: selectedPedido.cPacaHieloPed, precio: Number(selectedPedido.precioPacaHielo) },
                      BOTELLON_FAB: { cant: selectedPedido.cBotellonFabPed, precio: Number(selectedPedido.precioBotellonFab) },
                      BOTELLON_DOM: { cant: selectedPedido.cBotellonDomPed, precio: Number(selectedPedido.precioBotellonDom) },
                      BOLSA_AGUA: { cant: selectedPedido.cBolsaAguaPed, precio: Number(selectedPedido.precioBolsaAgua) },
                      BOLSA_HIELO: { cant: selectedPedido.cBolsaHieloPed, precio: Number(selectedPedido.precioBolsaHielo) },
                    }
                    const items = selectedPedido.items && selectedPedido.items.length > 0
                      ? selectedPedido.items
                      : Object.entries(legacyMap)
                          .filter(([, v]) => v.cant > 0)
                          .map(([producto, v]) => ({ producto, cantPedido: v.cant, precio: v.precio }))
                    if (items.length === 0) {
                      return <div className="text-sm text-gray-400 text-center py-2">Sin productos</div>
                    }
                    return items.map((item) => {
                      const meta = getProductoIconConfig(item.producto)
                      const Icon = meta.Icon
                      const bg = ITEM_BG[item.producto] || 'bg-gray-50'
                      return (
                        <div key={item.producto} className={`flex justify-between items-center ${bg} rounded-lg px-3 py-2`}>
                          <div className="flex items-center gap-2">
                            <Icon size={20} />
                            <span className="text-sm font-medium">{meta.label}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">{item.cantPedido} und</div>
                            <div className="text-xs text-gray-500">${formatCurrency(Number(item.precio))} c/u</div>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Stepper Visual de Estado */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado de Entrega</h3>
                <div className="relative">
                  {/* Línea de progreso */}
                  <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200">
                    <div
                      className={`h-full transition-all duration-500 ${
                        selectedPedido.estadoEntrega === 'PENDIENTE' ? 'w-0' :
                        selectedPedido.estadoEntrega === 'EN_RUTA' ? 'w-1/2' :
                        selectedPedido.estadoEntrega === 'ENTREGADO' ? 'w-full' :
                        selectedPedido.estadoEntrega === 'CANCELADO' ? 'w-full bg-gray-400' :
                        'w-full bg-red-400'
                      }`}
                      style={{
                        backgroundColor: selectedPedido.estadoEntrega === 'CANCELADO' ? '#9ca3af' :
                                         selectedPedido.estadoEntrega === 'ANULADO' ? '#f87171' : undefined
                      }}
                    />
                  </div>
                  {/* Pasos */}
                  <div className="relative flex justify-between">
                    {[
                      { key: 'PENDIENTE', label: 'Pendiente', icon: '📋' },
                      { key: 'EN_RUTA', label: 'En Ruta', icon: '🚚' },
                      { key: 'ENTREGADO', label: 'Entregado', icon: '✅' },
                    ].map((step, idx) => {
                      const isActive = selectedPedido.estadoEntrega === step.key
                      const isPast = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO'].indexOf(selectedPedido.estadoEntrega) > idx
                      const isCurrent = isActive
                      const isCancelled = selectedPedido.estadoEntrega === 'CANCELADO'
                      const isAnulled = selectedPedido.estadoEntrega === 'ANULADO'

                      let circleClass = 'bg-gray-200 text-gray-400 border-gray-300'
                      if (isCancelled || isAnulled) {
                        circleClass = 'bg-gray-300 text-gray-500 border-gray-400'
                      } else if (isCurrent) {
                        circleClass = step.key === 'PENDIENTE' ? 'bg-yellow-500 text-white border-yellow-500' :
                                      step.key === 'EN_RUTA' ? 'bg-blue-500 text-white border-blue-500' :
                                      'bg-green-500 text-white border-green-500'
                      } else if (isPast) {
                        circleClass = 'bg-green-100 text-green-700 border-green-300'
                      }

                      return (
                        <div key={step.key} className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm z-10 transition-all ${circleClass}`}>
                            {isPast && !isCancelled && !isAnulled ? '✓' : isCancelled && idx === 0 ? '✕' : isAnulled && idx === 2 ? '✕' : step.icon}
                          </div>
                          <span className={`text-[10px] mt-1 font-medium ${isCurrent ? 'text-gray-800' : 'text-gray-400'}`}>
                            {step.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Acciones según estado */}
                <div className="mt-4 flex gap-2">
                  {selectedPedido.estadoEntrega === 'PENDIENTE' && (
                    <>
                      <button
                        onClick={() => cambiarEstado(selectedPedido.id, 'EN_RUTA')}
                        disabled={updatingId === selectedPedido.id}
                        className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {updatingId === selectedPedido.id ? 'Enviando...' : '🚚 Enviar'}
                      </button>
                      <button
                        onClick={() => cambiarEstado(selectedPedido.id, 'CANCELADO')}
                        disabled={updatingId === selectedPedido.id}
                        className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  {selectedPedido.estadoEntrega === 'EN_RUTA' && (
                    <>
                      <button
                        onClick={() => cambiarEstado(selectedPedido.id, 'ENTREGADO')}
                        disabled={updatingId === selectedPedido.id}
                        className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
                      >
                        {updatingId === selectedPedido.id ? 'Entregando...' : '✅ Marcar Entregado'}
                      </button>
                      <button
                        onClick={() => cambiarEstado(selectedPedido.id, 'PENDIENTE')}
                        disabled={updatingId === selectedPedido.id}
                        className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        Volver a Pendiente
                      </button>
                    </>
                  )}
                  {selectedPedido.estadoEntrega === 'ENTREGADO' && (
                    <button
                      onClick={() => cambiarEstado(selectedPedido.id, 'ANULADO')}
                      disabled={updatingId === selectedPedido.id}
                      className="w-full py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition disabled:opacity-50"
                    >
                      {updatingId === selectedPedido.id ? 'Anulando...' : 'Anular Pedido'}
                    </button>
                  )}
                  {(selectedPedido.estadoEntrega === 'CANCELADO' || selectedPedido.estadoEntrega === 'ANULADO') && (
                    <div className="w-full py-2 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">
                      Pedido {selectedPedido.estadoEntrega === 'CANCELADO' ? 'cancelado' : 'anulado'} — Sin acciones disponibles
                    </div>
                  )}
                </div>
              </div>

              {/* Factura y Abonos */}
              {selectedPedido.factura && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">Factura</h3>
                    <a
                      href={`/facturas?openFactura=${selectedPedido.factura.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      → Ver factura #{selectedPedido.factura.numero}
                    </a>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-500">#{selectedPedido.factura.numero}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        selectedPedido.factura.estado === 'PAGADA' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {selectedPedido.factura.estado}
                      </span>
                    </div>
                    {selectedPedido.factura.abonos && selectedPedido.factura.abonos.length > 0 && (
                      <div className="border-t pt-2 mt-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">Abonos ({selectedPedido.factura.abonos.length}):</p>
                        <div className="space-y-1">
                          {selectedPedido.factura.abonos.map((abono) => (
                            <div key={abono.id} className="flex justify-between items-center text-sm">
                              <div>
                                <a
                                  href={`/facturas?openFactura=${selectedPedido.factura!.id}`}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  #{selectedPedido.factura!.numero}
                                </a>
                                <span className="text-gray-600 ml-2">{abono.metodoPago}</span>
                                <span className="text-gray-400 text-xs ml-2">{new Date(abono.fecha).toLocaleDateString('es-CO')}</span>
                              </div>
                              <span className="font-medium text-green-600">{formatCurrency(Number(abono.monto))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Confirm Modal */}
      {confirmModal}

      {/* FAB Unificado */}
      <div
        className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2"
        onMouseEnter={() => setFabOpen(true)}
        onMouseLeave={() => setFabOpen(false)}
      >
        {/* Speed Dial */}
        {fabOpen && (
          <div className="flex flex-col items-end gap-2 mb-2">
            <Tooltip content="Crea un pedido con cliente, dirección y envío a domicilio" title="Pedido con Envío" position="left">
              <button
                onClick={() => { setFabOpen(false); setShowModal(true) }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                <span>📦</span>
                <span>Pedido con Envío</span>
              </button>
            </Tooltip>
            <Tooltip content="Venta inmediata en punto de venta sin registro de cliente" title="Venta Rápida" position="left">
              <button
                onClick={() => { setFabOpen(false); setShowVentaRapida(true) }}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-full shadow-lg hover:bg-green-700 transition text-sm font-medium"
              >
                <span>💰</span>
                <span>Venta Rápida</span>
              </button>
            </Tooltip>
          </div>
        )}
        {/* FAB Principal */}
        <button
          onClick={() => setFabOpen((v) => !v)}
          className={`w-14 h-14 flex items-center justify-center rounded-full shadow-xl transition-all duration-200 ${
            fabOpen ? 'bg-gray-700 rotate-45' : 'bg-green-600 hover:bg-green-700'
          } text-white`}
          aria-label="Acciones rápidas"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function getFechaOffset(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

function getTituloFecha(desde: string | null, hasta: string | null): string {
  const hoy = getFechaOffset(0)
  const ayer = getFechaOffset(-1)
  const manana = getFechaOffset(1)

  if (!desde && !hasta) return 'Pedidos'
  if (desde === hoy && hasta === hoy) return 'Pedidos de Hoy'
  if (desde === ayer && hasta === ayer) return 'Pedidos de Ayer'
  if (desde === manana && hasta === manana) return 'Pedidos de Mañana'
  if (desde && hasta) {
    if (desde === hasta) {
      const fecha = new Date(desde + 'T00:00:00')
      return `Pedidos del ${fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}`
    }
    return `Pedidos: ${new Date(desde + 'T00:00:00').toLocaleDateString('es-CO')} → ${new Date(hasta + 'T00:00:00').toLocaleDateString('es-CO')}`
  }
  return 'Pedidos'
}


