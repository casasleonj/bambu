'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import { PedidoForm } from '@/components/pedido-form'


interface Pedido {
  id: string
  numero: number
  nombreCli: string
  telefonoCli: string
  zonaCli: string
  tipo: string
  estado: string
  cAguaEnt: number
  cHieloEnt: number
  total: number
  saldo: number
  fecha: string
}

interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  precioAguaPref: number
}

const ESTADOS = ['TODOS', 'PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO']
const TIPO_PEDIDO = ['ENVIO', 'MOSTRADOR', 'RECURRENTE']

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [precios, setPrecios] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchPedidos()
    fetchClientes()
    fetchPrecios()
  }, [])

  async function fetchPedidos() {
    try {
      const res = await fetch('/api/pedidos')
      const data = await res.json()
      setPedidos(data.pedidos || [])
    } catch (error) {
      console.error('Error fetching pedidos:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchClientes() {
    try {
      const res = await fetch('/api/clientes')
      const data = await res.json()
      setClientes(data.clientes || [])
    } catch (error) {
      console.error('Error fetching clientes:', error)
    }
  }

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
        alert(err.error?.formErrors?.[0] || 'Error creando pedido')
      }
    } catch (error) {
      console.error('Error creating pedido:', error)
      alert('Error creando pedido')
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

  const totalVentas = pedidosFiltrados.reduce((acc, p) => acc + p.total, 0)
  const totalFiado = pedidosFiltrados.reduce((acc, p) => acc + (p.saldo > 0 ? p.saldo : 0), 0)

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
        <h1 className="text-2xl font-bold text-gray-800">Pedidos del Día</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Nuevo Pedido
        </button>
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
            placeholder="Buscar por nombre o teléfono..."
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
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Nuevo Pedido</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <PedidoForm
                clientes={clientes}
                precios={precios}
                onSubmit={handleCrearPedido}
              />
            </div>
          </div>
        </div>
      )}

      {/* Lista de Pedidos */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">#</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Zona</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Agua</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Hielo</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Total</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pedidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
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
                    <td className="px-4 py-3 text-gray-600">{pedido.zonaCli || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {pedido.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3">{pedido.cAguaEnt}</td>
                    <td className="px-4 py-3">{pedido.cHieloEnt}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {formatCurrency(pedido.total)}
                    </td>
                    <td className="px-4 py-3">{getEstadoBadge(pedido.estado)}</td>
                    <td className="px-4 py-3">
                      <button className="text-blue-600 hover:text-blue-800 text-sm">
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}