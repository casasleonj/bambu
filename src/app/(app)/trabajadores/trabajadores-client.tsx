'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

interface Trabajador {
  id: string
  nombre: string
  rol: string
  tipoPago: string
  usaMoto: boolean
  comPacaAgua: number
  comPacaHielo: number
  salarioFijo: number
  deudaReposAgua: number
  deudaReposHielo: number
  telefono?: string
  activo: boolean
  createdAt: string
}

const rolOptions = ['SELLADOR', 'REPARTIDOR', 'ADMIN', 'CONTADOR']
const tipoPagoOptions = ['COMISION', 'FIJO']

const rolLabels: Record<string, string> = {
  SELLADOR: 'Sellador',
  REPARTIDOR: 'Repartidor',
  ADMIN: 'Administrador',
  CONTADOR: 'Contador',
}

const tipoPagoLabels: Record<string, string> = {
  COMISION: 'Comision',
  FIJO: 'Fijo',
}

interface TrabajadoresClientProps {
  initialTrabajadores: Trabajador[]
}

export default function TrabajadoresClient({ initialTrabajadores }: TrabajadoresClientProps) {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>(initialTrabajadores)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isEdit, setIsEdit] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [formData, setFormData] = useState({
    nombre: '',
    rol: 'SELLADOR',
    tipoPago: 'COMISION',
    usaMoto: false,
    comPacaAgua: 200,
    comPacaHielo: 200,
    salarioFijo: 0,
    telefono: '',
  })

  async function fetchTrabajadores() {
    try {
      const res = await fetch('/api/trabajadores')
      const data = await res.json()
      setTrabajadores(data.trabajadores || [])
    } catch (error) {
      console.error('Error fetching trabajadores:', error)
    }
  }

  const trabajadoresFiltrados = trabajadores.filter((t) => {
    const term = search.toLowerCase()
    return (
      t.nombre.toLowerCase().includes(term) ||
      t.rol.toLowerCase().includes(term) ||
      t.telefono?.toLowerCase().includes(term) ||
      t.tipoPago.toLowerCase().includes(term)
    )
  })

  function openCreateModal() {
    setFormData({
      nombre: '',
      rol: 'SELLADOR',
      tipoPago: 'COMISION',
      usaMoto: false,
      comPacaAgua: 200,
      comPacaHielo: 200,
      salarioFijo: 0,
      telefono: '',
    })
    setFormError('')
    setIsEdit(false)
    setEditingId(null)
    setShowModal(true)
  }

  function openEditModal(trabajador: Trabajador) {
    setFormData({
      nombre: trabajador.nombre,
      rol: trabajador.rol,
      tipoPago: trabajador.tipoPago,
      usaMoto: trabajador.usaMoto,
      comPacaAgua: trabajador.comPacaAgua,
      comPacaHielo: trabajador.comPacaHielo,
      salarioFijo: trabajador.salarioFijo,
      telefono: trabajador.telefono || '',
    })
    setFormError('')
    setIsEdit(true)
    setEditingId(trabajador.id)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    try {
      if (isEdit && editingId) {
        const res = await fetch(`/api/trabajadores/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (res.ok) {
          fetchTrabajadores()
          setShowModal(false)
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error || 'Error al actualizar trabajador')
        }
      } else {
        const res = await fetch('/api/trabajadores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (res.ok) {
          fetchTrabajadores()
          setShowModal(false)
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error || 'Error al crear trabajador')
        }
      }
    } catch (error) {
      console.error('Error saving trabajador:', error)
      setFormError('Error de conexion al guardar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Desactivar este trabajador?')) return
    try {
      const res = await fetch(`/api/trabajadores/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchTrabajadores()
      }
    } catch (error) {
      console.error('Error deleting trabajador:', error)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Trabajadores</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Nuevo Trabajador
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre, rol, telefono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trabajadoresFiltrados.length === 0 ? (
          <div className="col-span-full bg-white p-8 rounded-xl shadow text-center text-gray-500">
            No hay trabajadores
          </div>
        ) : (
          trabajadoresFiltrados.map((t) => (
            <div
              key={t.id}
              className="bg-white p-4 rounded-xl shadow hover:shadow-md transition"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-800">{t.nombre}</p>
                  <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                    {rolLabels[t.rol] || t.rol}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(t)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    title="Editar"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                    title="Desactivar"
                  >
                    Desactivar
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo de pago</span>
                  <span className="font-medium text-gray-700">
                    {tipoPagoLabels[t.tipoPago] || t.tipoPago}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-500">Usa moto</span>
                  <span className="font-medium text-gray-700">
                    {t.usaMoto ? 'Si' : 'No'}
                  </span>
                </div>

                {t.telefono && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Telefono</span>
                    <span className="font-medium text-gray-700">{t.telefono}</span>
                  </div>
                )}

                <div className="border-t pt-2 mt-2 space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Configuracion de pago
                  </p>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Com. paca agua</span>
                    <span className="font-medium text-gray-700">
                      {formatCurrency(t.comPacaAgua)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Com. paca hielo</span>
                    <span className="font-medium text-gray-700">
                      {formatCurrency(t.comPacaHielo)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Salario fijo</span>
                    <span className="font-medium text-gray-700">
                      {formatCurrency(t.salarioFijo)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {isEdit ? 'Editar Trabajador' : 'Nuevo Trabajador'}
            </h2>
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
                {formError}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Rol *</label>
                  <select
                    required
                    value={formData.rol}
                    onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {rolOptions.map((r) => (
                      <option key={r} value={r}>
                        {rolLabels[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de pago</label>
                  <select
                    value={formData.tipoPago}
                    onChange={(e) => setFormData({ ...formData, tipoPago: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {tipoPagoOptions.map((tp) => (
                      <option key={tp} value={tp}>
                        {tipoPagoLabels[tp]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="usaMoto"
                  type="checkbox"
                  checked={formData.usaMoto}
                  onChange={(e) => setFormData({ ...formData, usaMoto: e.target.checked })}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="usaMoto" className="text-sm font-medium text-gray-700">
                  Usa moto
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Com. paca agua</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.comPacaAgua}
                    onChange={(e) =>
                      setFormData({ ...formData, comPacaAgua: parseFloat(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Com. paca hielo</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.comPacaHielo}
                    onChange={(e) =>
                      setFormData({ ...formData, comPacaHielo: parseFloat(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Salario fijo</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.salarioFijo}
                    onChange={(e) =>
                      setFormData({ ...formData, salarioFijo: parseFloat(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefono</label>
                  <input
                    type="text"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
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
    </div>
  )
}
