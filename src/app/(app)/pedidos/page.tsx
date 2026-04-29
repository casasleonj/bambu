'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'

const PedidoForm = dynamic(() => import('@/components/pedido-form').then(m => m.PedidoForm), { ssr: false })
const VentaRapidaForm = dynamic(() => import('@/components/venta-rapida-form').then(m => m.VentaRapidaForm), { ssr: false })


interface Pedido {
  id: string
  numero: number
  nombreCli: string
  telefonoCli: string
  zonaCli: string
  tipo: string
  canal: string
  estado: string
  embarqueId?: string
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
  precioPacaAgua: number
  precioPacaHielo: number
  precioBotellonFab: number
  precioBotellonDom: number
  precioBolsaAgua: number
  precioBolsaHielo: number
  totalPagado: number
  total: number
  saldo: number
  fecha: string
}

interface Embarque {
  id: string
  numero: number
  trabajador: { nombre: string }
  estado: string
}

interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  preciosEspeciales?: string
}

const ESTADOS = ['TODOS', 'PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO']
const TIPOS = ['TODOS', 'ENVIO', 'PUNTO']

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showVentaRapida, setShowVentaRapida] = useState(false)
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [precios, setPrecios] = useState<Record<string, number>>({})
  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [embarques, setEmbarques] = useState<Embarque[]>([])
  const [showEmbarqueModal, setShowEmbarqueModal] = useState(false)
  const [selectedPedidoForEmbarque, setSelectedPedidoForEmbarque] = useState<string | null>(null)
  const [selectedEmbarqueId, setSelectedEmbarqueId] = useState('')

  useEffect(() => {
    fetchPedidos()
    fetchClientes()
    fetchPrecios()
    fetchEmbarques()
  }, [])

  // Auto-refresh para sincronizar entre browsers
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPedidos()
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPedidos()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  async function fetchPedidos() {
    try {
      const res = await fetch('/api/pedidos')
      const data = await res.json()
      setPedidos(data.pedidos || data.data || [])
    } catch (error) {
      console.error('Error fetching pedidos:', error)
      toast.error('Error cargando pedidos')
    } finally {
      setLoading(false)
    }
  }

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

  async function handleVentaRapida(data: any) {
    try {
      const pedidoData = {
        clienteId: data.clienteId || 'CLIENTE_MOSTRADOR',
        canal: data.canal,
        productos: data.productos,
        pagos: data.pagos,
        obs: data.obs,
        clienteNuevo: data.clienteNuevo,
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

  const pedidosFiltrados = pedidos.filter((p) => {
    const matchEstado = filtroEstado === 'TODOS' || p.estado === filtroEstado
    const matchTipo = filtroTipo === 'TODOS' || p.tipo === filtroTipo
    const matchSearch =
      !search ||
      p.nombreCli.toLowerCase().includes(search.toLowerCase()) ||
      p.telefonoCli?.includes(search) ||
      p.numero.toString().includes(search)
    return matchEstado && matchTipo && matchSearch
  })

  const totalVentas = pedidosFiltrados.reduce((acc, p) => acc + Number(p.total || 0), 0)
  // Fiado solo cuenta pedidos ENTREGADOS con saldo pendiente
  const totalFiado = pedidosFiltrados
    .filter(p => p.estado === 'ENTREGADO' && Number(p.saldo) > 0)
    .reduce((acc, p) => acc + Number(p.saldo), 0)

  function getEstadoBadge(estado: string) {
    const styles: Record<string, string> = {
      PENDIENTE: 'bg-yellow-100 text-yellow-800',
      EN_RUTA: 'bg-blue-100 text-blue-800',
      ENTREGADO: 'bg-green-100 text-green-800',
      CANCELADO: 'bg-gray-100 text-gray-800',
      ANULADO: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[estado] || ''}`}>
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

  // Fiado solo se muestra en pedidos ENTREGADOS
  function tieneFiado(pedido: Pedido): boolean {
    return pedido.estado === 'ENTREGADO' && Number(pedido.saldo) > 0
  }

  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function cambiarEstado(id: string, nuevoEstado: string) {
    if (updatingId) return

    // If changing to EN_RUTA, ask for embarque assignment first
    if (nuevoEstado === 'EN_RUTA') {
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
    if (!selectedPedidoForEmbarque) return
    setUpdatingId(selectedPedidoForEmbarque)
    try {
      // First change state to EN_RUTA
      const resEstado = await fetch(`/api/pedidos/${selectedPedidoForEmbarque}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'EN_RUTA' }),
      })
      if (!resEstado.ok) {
        toast.error('Error cambiando estado')
        return
      }

      // Then assign to embarque if selected
      if (selectedEmbarqueId) {
        const resEmbarque = await fetch(`/api/pedidos/${selectedPedidoForEmbarque}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embarqueId: selectedEmbarqueId }),
        })
        if (resEmbarque.ok) {
          toast.success('Pedido enviado y asignado a embarque')
        } else {
          toast.success('Pedido enviado (no asignado a embarque)')
        }
      } else {
        toast.success('Pedido enviado')
      }
      fetchPedidos()
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

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder="Buscar por nombre, telefono o #pedido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-64 px-4 py-2 border border-gray-300 rounded-lg"
          />
          <div className="flex gap-2 flex-wrap">
            {ESTADOS.map((estado) => (
              <button
                key={estado}
                onClick={() => setFiltroEstado(estado)}
                className={`px-4 py-2.5 rounded-full text-sm transition ${
                  filtroEstado === estado
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {estado}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {TIPOS.map((tipo) => (
              <button
                key={tipo}
                onClick={() => setFiltroTipo(tipo)}
                className={`px-4 py-2.5 rounded-full text-sm transition ${
                  filtroTipo === tipo
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tipo}
              </button>
            ))}
          </div>
        </div>
      </div>

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

      {/* Lista de Pedidos */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {/* Desktop table - hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">#</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Productos</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Total</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pedidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No hay pedidos
                  </td>
                </tr>
              ) : (
                pedidosFiltrados.map((pedido) => {
                  const productosList = [
                    { key: 'pacaAgua', label: '🍶', count: pedido.cPacaAguaPed },
                    { key: 'pacaHielo', label: '🧊', count: pedido.cPacaHieloPed },
                    { key: 'botellonFab', label: '🏭', count: pedido.cBotellonFabPed },
                    { key: 'botellonDom', label: '🏠', count: pedido.cBotellonDomPed },
                    { key: 'bolsaAgua', label: '💧', count: pedido.cBolsaAguaPed },
                    { key: 'bolsaHielo', label: '❄️', count: pedido.cBolsaHieloPed },
                  ].filter(p => p.count > 0)
                  const fiado = tieneFiado(pedido)
                  return (
                    <tr key={pedido.id} className={`hover:bg-gray-50 transition ${fiado ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-500">#{pedido.numero}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-gray-800">{pedido.nombreCli}</span>
                          {getTipoBadge(pedido.tipo)}
                        </div>
                        <div className="text-xs text-gray-400">{pedido.telefonoCli}</div>
                        {fiado && (
                          <span className="text-xs text-red-600 font-medium">Fiado: {formatCurrency(Number(pedido.saldo))}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {productosList.length === 0 ? (
                            <span className="text-xs text-gray-400">Sin productos</span>
                          ) : (
                            productosList.map(p => (
                              <span key={p.key} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                                <span>{p.label}</span>
                                <span>{p.count}</span>
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-gray-800">{formatCurrency(Number(pedido.total))}</div>
                        {fiado && (
                          <div className="text-xs text-red-500">Pendiente: {formatCurrency(Number(pedido.saldo))}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{getEstadoBadge(pedido.estado)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setSelectedPedido(pedido); setShowDetailModal(true) }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Ver detalle"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                          {pedido.estado === 'PENDIENTE' && (
                            <button 
                              onClick={() => cambiarEstado(pedido.id, 'EN_RUTA')} 
                              disabled={updatingId === pedido.id}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Enviar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            </button>
                          )}
                          {pedido.estado === 'EN_RUTA' && (
                            <button 
                              onClick={() => cambiarEstado(pedido.id, 'ENTREGADO')} 
                              disabled={updatingId === pedido.id}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Entregar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards - visible only on mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {pedidosFiltrados.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">No hay pedidos</div>
          ) : (
            pedidosFiltrados.map((pedido) => {
              const fiado = tieneFiado(pedido)
              return (
                <div 
                  key={pedido.id} 
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition ${fiado ? 'bg-red-50/30' : ''}`}
                  onClick={() => {
                    setSelectedPedido(pedido)
                    setShowDetailModal(true)
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-400">#{pedido.numero}</span>
                        {getEstadoBadge(pedido.estado)}
                        {getTipoBadge(pedido.tipo)}
                      </div>
                      <h3 className="font-medium text-gray-800 text-sm">{pedido.nombreCli}</h3>
                      <p className="text-xs text-gray-400">{pedido.telefonoCli}</p>
                    </div>
                    <div className="text-right ml-2">
                      <p className="font-bold text-gray-800 text-sm">{formatCurrency(Number(pedido.total))}</p>
                      {fiado && (
                        <p className="text-xs text-red-500 font-medium">Pendiente</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {pedido.cPacaAguaPed > 0 && <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">🍶 {pedido.cPacaAguaPed}</span>}
                    {pedido.cPacaHieloPed > 0 && <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">🧊 {pedido.cPacaHieloPed}</span>}
                    {pedido.cBotellonFabPed > 0 && <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">🏭 {pedido.cBotellonFabPed}</span>}
                    {pedido.cBotellonDomPed > 0 && <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">🏠 {pedido.cBotellonDomPed}</span>}
                    {pedido.cBolsaAguaPed > 0 && <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">💧 {pedido.cBolsaAguaPed}</span>}
                    {pedido.cBolsaHieloPed > 0 && <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">❄️ {pedido.cBolsaHieloPed}</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Modal Asignar Embarque */}
      <Modal open={showEmbarqueModal} onClose={() => { setShowEmbarqueModal(false); setSelectedPedidoForEmbarque(null) }} className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <h2 className="text-lg font-bold mb-4">Asignar a Embarque</h2>
        <p className="text-sm text-gray-500 mb-4">Selecciona un embarque abierto para este pedido:</p>
        {embarques.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-2">No hay embarques abiertos</p>
            <button
              onClick={() => { setShowEmbarqueModal(false); setSelectedPedidoForEmbarque(null) }}
              className="text-blue-600 text-sm font-medium hover:text-blue-800"
            >
              Enviar sin asignar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={selectedEmbarqueId}
              onChange={(e) => setSelectedEmbarqueId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sin embarque (enviar solo)</option>
              {embarques.map((e) => (
                <option key={e.id} value={e.id}>
                  #{e.numero} - {e.trabajador.nombre}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowEmbarqueModal(false); setSelectedPedidoForEmbarque(null) }}
                className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={asignarEmbarque}
                disabled={updatingId === selectedPedidoForEmbarque}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {updatingId === selectedPedidoForEmbarque ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showDetailModal && !!selectedPedido} onClose={() => setShowDetailModal(false)} className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {selectedPedido && (
          <>
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-400">#{selectedPedido.numero}</span>
                  {getEstadoBadge(selectedPedido.estado)}
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
              {/* Total Summary Card */}
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

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Canal</div>
                  <div className="font-medium text-gray-700">{selectedPedido.canal || 'N/A'}</div>
                </div>
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Tipo</div>
                  <div className="font-medium text-gray-700">{selectedPedido.tipo}</div>
                </div>
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Fecha</div>
                  <div className="font-medium text-gray-700">{new Date(selectedPedido.fecha).toLocaleDateString('es-CO')}</div>
                </div>
                {selectedPedido.estado === 'EN_RUTA' && selectedPedido.embarqueId && (
                  <div className="bg-white border rounded-lg p-2.5">
                    <div className="text-xs text-gray-400 mb-0.5">Embarque</div>
                    <div className="font-medium text-gray-700">#{embarques.find(e => e.id === selectedPedido.embarqueId)?.numero || selectedPedido.embarqueId}</div>
                  </div>
                )}
              </div>

              {/* Productos */}
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

              {/* Estado Timeline */}
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
                    // CANCELADO: available from PENDIENTE or EN_RUTA
                    // ANULADO: available only from ENTREGADO
                    const canCancel = ['PENDIENTE', 'EN_RUTA'].includes(selectedPedido.estado) && est === 'CANCELADO'
                    const canAnular = selectedPedido.estado === 'ENTREGADO' && est === 'ANULADO'
                    const isClickable = (est !== selectedPedido.estado) && (canCancel || canAnular || (['PENDIENTE', 'EN_RUTA', 'ENTREGADO'].includes(est) && !['CANCELADO', 'ANULADO'].includes(selectedPedido.estado)))
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
