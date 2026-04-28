'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { PedidoForm } from '@/components/pedido-form'
import { VentaRapidaForm } from '@/components/venta-rapida-form'
import { Modal } from '@/components/modal'


interface Pedido {
  id: string
  numero: number
  nombreCli: string
  telefonoCli: string
  zonaCli: string
  tipo: string
  canal: string
  estado: string
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

interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  preciosEspeciales?: string
}

const ESTADOS = ['TODOS', 'PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO']
const TIPO_PEDIDO = ['ENVIO', 'MOSTRADOR', 'RECURRENTE']

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

  useEffect(() => {
    fetchPedidos()
    fetchClientes()
    fetchPrecios()
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
      let clienteId = 'CLIENTE_MOSTRADOR'

      // Si quiere envío, crear/buscar cliente primero
      if (data.clienteNuevo) {
        const clienteRes = await fetch('/api/clientes/quick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.clienteNuevo),
        })
        if (clienteRes.ok) {
          const { cliente } = await clienteRes.json()
          clienteId = cliente.id
        } else {
          toast.error('Error creando cliente')
          return
        }
      }

      const pedidoData = {
        clienteId,
        canal: data.canal,
        tipo: data.tipo,
        ventaRapida: true,
        productos: data.productos,
        pagos: data.pagos,
        obs: data.obs,
      }

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pedidoData),
      })

      if (res.ok) {
        setShowVentaRapida(false)
        fetchPedidos()
        toast.success(`Venta cobrada: $${data.total.toLocaleString()}`)
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
    const matchSearch =
      !search ||
      p.nombreCli.toLowerCase().includes(search.toLowerCase()) ||
      p.telefonoCli?.includes(search)
    return matchEstado && matchSearch
  })

  const totalVentas = pedidosFiltrados.reduce((acc, p) => acc + Number(p.total || 0), 0)
  const totalFiado = pedidosFiltrados.reduce((acc, p) => acc + (Number(p.saldo) > 0 ? Number(p.saldo) : 0), 0)

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

  async function cambiarEstado(id: string, nuevoEstado: string) {
    try {
      const res = await fetch(`/api/pedidos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (res.ok) {
        setShowDetailModal(false)
        fetchPedidos()
      }
    } catch (error) {
      console.error('Error cambiando estado:', error)
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
            placeholder="Buscar por nombre o telefono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-64 px-4 py-2 border border-gray-300 rounded-lg"
          />
          <div className="flex gap-2 flex-wrap">
            {ESTADOS.map((estado) => (
              <button
                key={estado}
                onClick={() => setFiltroEstado(estado)}
                className={`px-3 py-1 rounded-full text-sm transition ${
                  filtroEstado === estado
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {estado}
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
            className="text-gray-500 hover:text-gray-700"
          >
            X
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
            className="text-gray-500 hover:text-gray-700"
          >
            X
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <VentaRapidaForm
            precios={precios}
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
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Canal</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">P.Ag</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">P.Hi</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">B.Fb</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">B.Dm</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Bl.Ag</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Bl.Hi</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Total</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pedidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                    No hay pedidos
                  </td>
                </tr>
              ) : (
                pedidosFiltrados.map((pedido) => (
                  <tr key={pedido.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{pedido.numero}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{pedido.nombreCli}</div>
                      <div className="text-sm text-gray-500">{pedido.telefonoCli}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {pedido.canal || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {pedido.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3">{pedido.cPacaAguaPed}</td>
                    <td className="px-4 py-3">{pedido.cPacaHieloPed}</td>
                    <td className="px-4 py-3">{pedido.cBotellonFabPed}</td>
                    <td className="px-4 py-3">{pedido.cBotellonDomPed}</td>
                    <td className="px-4 py-3">{pedido.cBolsaAguaPed}</td>
                    <td className="px-4 py-3">{pedido.cBolsaHieloPed}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {formatCurrency(Number(pedido.total))}
                    </td>
                    <td className="px-4 py-3">{getEstadoBadge(pedido.estado)}</td>
                    <td className="px-4 py-3">
                      <button 
                        onClick={() => {
                          setSelectedPedido(pedido)
                          setShowDetailModal(true)
                        }}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards - visible only on mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {pedidosFiltrados.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">No hay pedidos</div>
          ) : (
            pedidosFiltrados.map((pedido) => (
              <div 
                key={pedido.id} 
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setSelectedPedido(pedido)
                  setShowDetailModal(true)
                }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-sm text-gray-500">#{pedido.numero}</span>
                    <h3 className="font-medium text-gray-800">{pedido.nombreCli}</h3>
                    <p className="text-sm text-gray-500">{pedido.telefonoCli}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800">{formatCurrency(Number(pedido.total))}</p>
                    {getEstadoBadge(pedido.estado)}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap text-xs text-gray-500">
                  {pedido.canal && <span className="bg-gray-100 px-2 py-0.5 rounded">{pedido.canal}</span>}
                  <span className="bg-gray-100 px-2 py-0.5 rounded">{pedido.tipo}</span>
                  {pedido.cPacaAguaPed > 0 && <span>P.Ag:{pedido.cPacaAguaPed}</span>}
                  {pedido.cPacaHieloPed > 0 && <span>P.Hi:{pedido.cPacaHieloPed}</span>}
                  {pedido.cBotellonFabPed > 0 && <span>B.Fb:{pedido.cBotellonFabPed}</span>}
                  {pedido.cBotellonDomPed > 0 && <span>B.Dm:{pedido.cBotellonDomPed}</span>}
                  {pedido.cBolsaAguaPed > 0 && <span>Bl.Ag:{pedido.cBolsaAguaPed}</span>}
                  {pedido.cBolsaHieloPed > 0 && <span>Bl.Hi:{pedido.cBolsaHieloPed}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal open={showDetailModal && !!selectedPedido} onClose={() => setShowDetailModal(false)} className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {selectedPedido && (
          <>
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Pedido #{selectedPedido.numero}</h2>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-500 hover:text-gray-700">X</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Cliente:</span> {selectedPedido.nombreCli}</div>
                <div><span className="text-gray-500">Telefono:</span> {selectedPedido.telefonoCli}</div>
                <div><span className="text-gray-500">Canal:</span> {selectedPedido.canal || '-'}</div>
                <div><span className="text-gray-500">Tipo:</span> {selectedPedido.tipo}</div>
                <div><span className="text-gray-500">Estado:</span> {getEstadoBadge(selectedPedido.estado)}</div>
                <div><span className="text-gray-500">Fecha:</span> {new Date(selectedPedido.fecha).toLocaleDateString('es-CO')}</div>
                <div><span className="text-gray-500">Total:</span> {formatCurrency(selectedPedido.total)}</div>
              </div>
              <div className="border-t pt-2">
                <h3 className="font-medium mb-1">Productos</h3>
                <div className="text-sm space-y-1">
                  {selectedPedido.cPacaAguaEnt > 0 && <div>Paca Agua: {selectedPedido.cPacaAguaEnt} x {formatCurrency(selectedPedido.precioPacaAgua)}</div>}
                  {selectedPedido.cPacaHieloEnt > 0 && <div>Paca Hielo: {selectedPedido.cPacaHieloEnt} x {formatCurrency(selectedPedido.precioPacaHielo)}</div>}
                  {selectedPedido.cBotellonFabEnt > 0 && <div>Botellon Fab: {selectedPedido.cBotellonFabEnt} x {formatCurrency(selectedPedido.precioBotellonFab)}</div>}
                  {selectedPedido.cBotellonDomEnt > 0 && <div>Botellon Dom: {selectedPedido.cBotellonDomEnt} x {formatCurrency(selectedPedido.precioBotellonDom)}</div>}
                  {selectedPedido.cBolsaAguaEnt > 0 && <div>Bolsa Agua: {selectedPedido.cBolsaAguaEnt} x {formatCurrency(selectedPedido.precioBolsaAgua)}</div>}
                  {selectedPedido.cBolsaHieloEnt > 0 && <div>Bolsa Hielo: {selectedPedido.cBolsaHieloEnt} x {formatCurrency(selectedPedido.precioBolsaHielo)}</div>}
                </div>
              </div>
              <div className="border-t pt-2 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Pagado:</span> {formatCurrency(selectedPedido.totalPagado)}</div>
                <div><span className="text-gray-500">Saldo:</span> <span className={selectedPedido.saldo > 0 ? 'text-red-600' : 'text-green-600'}>{formatCurrency(selectedPedido.saldo)}</span></div>
              </div>
              <div className="border-t pt-3">
                <h3 className="font-medium mb-2">Cambiar Estado</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedPedido.estado !== 'PENDIENTE' && (
                    <button onClick={() => cambiarEstado(selectedPedido.id, 'PENDIENTE')} className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200">Pendiente</button>
                  )}
                  {selectedPedido.estado !== 'EN_RUTA' && (
                    <button onClick={() => cambiarEstado(selectedPedido.id, 'EN_RUTA')} className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200">En Ruta</button>
                  )}
                  {selectedPedido.estado !== 'ENTREGADO' && (
                    <button onClick={() => cambiarEstado(selectedPedido.id, 'ENTREGADO')} className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full hover:bg-green-200">Entregado</button>
                  )}
                  {selectedPedido.estado !== 'CANCELADO' && (
                    <button onClick={() => cambiarEstado(selectedPedido.id, 'CANCELADO')} className="px-3 py-1 text-xs bg-gray-100 text-gray-800 rounded-full hover:bg-gray-200">Cancelado</button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
