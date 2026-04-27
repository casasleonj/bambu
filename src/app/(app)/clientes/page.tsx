'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Cliente {
  id: string
  clienteId: string
  nombre: string
  apellido?: string
  telefono: string
  nombreNegocio?: string
  tipoNegocio?: string
  barrio?: string
  direccion?: string
  frecuencia: string
  cadaNDias?: number
  precioAguaPref?: number
  notas?: string
  ultEntrega?: string
  activo: boolean
  _count?: { pedidos: number }
  pedidos?: Pedido[]
  facturas?: Factura[]
}

interface Pedido {
  id: string
  numero: number
  total: number
  estado: string
  fecha: string
}

interface Factura {
  id: string
  numero: string
  total: number
  fecha: string
}

const freqOptions = ['NINGUNA', 'DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'CADA_N_DIAS']

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [activeTab, setActiveTab] = useState('info')
  const [isEdit, setIsEdit] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    nombreNegocio: '',
    tipoNegocio: '',
    barrio: '',
    direccion: '',
    frecuencia: 'NINGUNA',
    cadaNDias: 0,
    precioAguaPref: 0,
    notas: '',
  })

  useEffect(() => {
    fetchClientes()
  }, [])

  async function fetchClientes() {
    try {
      const res = await fetch('/api/clientes')
      const data = await res.json()
      setClientes(data.clientes || [])
    } catch (error) {
      console.error('Error fetching clientes:', error)
    } finally {
      setLoading(false)
    }
  }

  const clientesFiltrados = clientes.filter((c) => {
    const term = search.toLowerCase()
    return (
      c.nombre.toLowerCase().includes(term) ||
      c.apellido?.toLowerCase().includes(term) ||
      c.telefono.includes(term) ||
      c.nombreNegocio?.toLowerCase().includes(term) ||
      c.barrio?.toLowerCase().includes(term) ||
      c.clienteId.toLowerCase().includes(term)
    )
  })

  function openCreateModal() {
    setFormData({
      nombre: '',
      apellido: '',
      telefono: '',
      nombreNegocio: '',
      tipoNegocio: '',
      barrio: '',
      direccion: '',
      frecuencia: 'NINGUNA',
      cadaNDias: 0,
      precioAguaPref: 0,
      notas: '',
    })
    setIsEdit(false)
    setShowModal(true)
  }

  function openEditModal() {
    if (!selectedCliente) return
    setFormData({
      nombre: selectedCliente.nombre,
      apellido: selectedCliente.apellido || '',
      telefono: selectedCliente.telefono,
      nombreNegocio: selectedCliente.nombreNegocio || '',
      tipoNegocio: selectedCliente.tipoNegocio || '',
      barrio: selectedCliente.barrio || '',
      direccion: selectedCliente.direccion || '',
      frecuencia: selectedCliente.frecuencia,
      cadaNDias: selectedCliente.cadaNDias || 0,
      precioAguaPref: selectedCliente.precioAguaPref || 0,
      notas: selectedCliente.notas || '',
    })
    setIsEdit(true)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (isEdit && selectedCliente) {
        const res = await fetch(`/api/clientes/${selectedCliente.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (res.ok) {
          fetchClientes()
          setShowModal(false)
        }
      } else {
        const res = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (res.ok) {
          fetchClientes()
          setShowModal(false)
        }
      }
    } catch (error) {
      console.error('Error saving cliente:', error)
    }
  }

  async function viewCliente(id: string) {
    try {
      const res = await fetch(`/api/clientes/${id}`)
      const data = await res.json()
      if (data.cliente) {
        setSelectedCliente(data.cliente)
        setShowDetail(true)
        setActiveTab('info')
      }
    } catch (error) {
      console.error('Error fetching cliente:', error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar este cliente?')) return
    try {
      const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchClientes()
        setShowDetail(false)
        setSelectedCliente(null)
      }
    } catch (error) {
      console.error('Error deleting cliente:', error)
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Nuevo Cliente
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono, negocio, barrio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clientesFiltrados.length === 0 ? (
          <div className="col-span-full bg-white p-8 rounded-xl shadow text-center text-gray-500">
            No hay clientes
          </div>
        ) : (
          clientesFiltrados.map((cliente) => (
            <div
              key={cliente.id}
              className="bg-white p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer"
              onClick={() => viewCliente(cliente.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-gray-800">
                    {cliente.nombre} {cliente.apellido}
                  </p>
                  <p className="text-sm text-gray-500">{cliente.clienteId}</p>
                </div>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {cliente._count?.pedidos || 0} pedidos
                </span>
              </div>
              {cliente.nombreNegocio && (
                <p className="text-sm text-gray-600 mb-1">{cliente.nombreNegocio}</p>
              )}
              <div className="text-sm text-gray-500 mb-1">{cliente.telefono}</div>
              <div className="flex justify-between text-sm">
                <span>{cliente.barrio || '-'}</span>
                <span className={cliente.frecuencia !== 'NINGUNA' ? 'text-green-600' : 'text-gray-400'}>
                  {cliente.frecuencia}
                </span>
              </div>
              {cliente.ultEntrega && (
                <p className="text-xs text-gray-400 mt-2">
                  Última: {formatDate(cliente.ultEntrega)}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre *</label>
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Apellido</label>
                  <input
                    type="text"
                    value={formData.apellido}
                    onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Teléfono *</label>
                <input
                  type="tel"
                  required
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Negocio</label>
                  <input
                    type="text"
                    value={formData.nombreNegocio}
                    onChange={(e) => setFormData({ ...formData, nombreNegocio: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo</label>
                  <input
                    type="text"
                    value={formData.tipoNegocio}
                    onChange={(e) => setFormData({ ...formData, tipoNegocio: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Barrio</label>
                <input
                  type="text"
                  value={formData.barrio}
                  onChange={(e) => setFormData({ ...formData, barrio: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dirección</label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Frecuencia</label>
                  <select
                    value={formData.frecuencia}
                    onChange={(e) => setFormData({ ...formData, frecuencia: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {freqOptions.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                {formData.frecuencia === 'CADA_N_DIAS' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Cada N días</label>
                    <input
                      type="number"
                      value={formData.cadaNDias}
                      onChange={(e) => setFormData({ ...formData, cadaNDias: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Precio Agua Pref.</label>
                <input
                  type="number"
                  value={formData.precioAguaPref}
                  onChange={(e) => setFormData({ ...formData, precioAguaPref: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas</label>
                <textarea
                  value={formData.notas}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDetail && selectedCliente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {selectedCliente.nombre} {selectedCliente.apellido}
                </h2>
                <p className="text-sm text-gray-500">{selectedCliente.clienteId}</p>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="flex border-b">
              {['info', 'pedidos', 'facturas'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-3 text-sm font-medium capitalize ${
                    activeTab === tab
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Teléfono</p>
                      <p className="font-medium">{selectedCliente.telefono}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Zona</p>
                      <p className="font-medium">{selectedCliente.barrio || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Negocio</p>
                      <p className="font-medium">{selectedCliente.nombreNegocio || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Tipo</p>
                      <p className="font-medium">{selectedCliente.tipoNegocio || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Frecuencia</p>
                      <p className="font-medium">{selectedCliente.frecuencia}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Pref. Precio</p>
                      <p className="font-medium">
                        {selectedCliente.precioAguaPref
                          ? formatCurrency(selectedCliente.precioAguaPref)
                          : '-'}
                      </p>
                    </div>
                  </div>
                  {selectedCliente.direccion && (
                    <div>
                      <p className="text-sm text-gray-500">Dirección</p>
                      <p className="font-medium">{selectedCliente.direccion}</p>
                    </div>
                  )}
                  {selectedCliente.notas && (
                    <div>
                      <p className="text-sm text-gray-500">Notas</p>
                      <p className="font-medium">{selectedCliente.notas}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pedidos' && (
                <div>
                  {selectedCliente.pedidos?.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Sin pedidos</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedCliente.pedidos?.map((pedido) => (
                        <div
                          key={pedido.id}
                          className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium">#{pedido.numero}</p>
                            <p className="text-sm text-gray-500">{formatDate(pedido.fecha)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(pedido.total)}</p>
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                pedido.estado === 'ENTREGADO'
                                  ? 'bg-green-100 text-green-800'
                                  : pedido.estado === 'PENDIENTE'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {pedido.estado}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'facturas' && (
                <div>
                  {selectedCliente.facturas?.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Sin facturas</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedCliente.facturas?.map((factura) => (
                        <div
                          key={factura.id}
                          className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium">#{factura.numero}</p>
                            <p className="text-sm text-gray-500">{formatDate(factura.fecha)}</p>
                          </div>
                          <p className="font-medium">{formatCurrency(factura.total)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex gap-3">
              <button
                onClick={openEditModal}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(selectedCliente.id)}
                className="flex-1 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}