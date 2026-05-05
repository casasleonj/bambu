'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import type { Trabajador, TrabajadorFormData, TrabajadoresClientProps } from './types'
import { TrabajadorCard } from './trabajador-card'
import { TrabajadorFormModal } from './trabajador-form-modal'

const EMPTY_FORM: TrabajadorFormData = {
  nombre: '',
  rol: 'SELLADOR',
  tipoPago: 'COMISION',
  usaMoto: false,
  capacidadKg: 500,
  comPacaAgua: 200,
  comPacaHielo: 200,
  salarioFijo: 0,
  telefono: '',
}

export default function TrabajadoresClient({ initialTrabajadores }: TrabajadoresClientProps) {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>(initialTrabajadores)
  const { confirm, modal } = useConfirm()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isEdit, setIsEdit] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<TrabajadorFormData>(EMPTY_FORM)
  const [fetchError, setFetchError] = useState<string | null>(null)

  async function fetchTrabajadores() {
    setFetchError(null)
    try {
      const res = await fetch('/api/trabajadores?activo=true')
      if (!res.ok) throw new Error('Error al cargar trabajadores')
      const data = await res.json()
      setTrabajadores(data.trabajadores || [])
    } catch {
      setFetchError('No se pudieron cargar los trabajadores')
      toast.error('Error cargando trabajadores')
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
    setFormData(EMPTY_FORM)
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
      capacidadKg: trabajador.capacidadKg,
      comPacaAgua: trabajador.comPacaAgua,
      comPacaHielo: trabajador.comPacaHielo,
      salarioFijo: trabajador.salarioFijo,
      telefono: trabajador.telefono || '',
    })
    setIsEdit(true)
    setEditingId(trabajador.id)
    setShowModal(true)
  }

  async function handleDelete(id: string) {
    const ok = await confirm('Desactivar este trabajador?')
    if (!ok) return
    try {
      const res = await fetch(`/api/trabajadores/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        fetchTrabajadores()
        toast.success('Trabajador desactivado')
      } else {
        toast.error(data.error || 'Error al desactivar trabajador')
      }
    } catch {
      toast.error('Error de conexion al desactivar')
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

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <p className="text-red-700 text-sm">{fetchError}</p>
          <button
            onClick={fetchTrabajadores}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trabajadores.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              title="No hay trabajadores"
              description="Registra los trabajadores de tu equipo"
              actionLabel="+ Crear Trabajador"
              onAction={() => setShowModal(true)}
            />
          </div>
        ) : trabajadoresFiltrados.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No se encontraron resultados para "{search}"</p>
            <button
              onClick={() => setSearch('')}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Limpiar busqueda
            </button>
          </div>
        ) : (
          trabajadoresFiltrados.map((t) => (
            <TrabajadorCard
              key={t.id}
              trabajador={t}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <TrabajadorFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={fetchTrabajadores}
        isEdit={isEdit}
        editingId={editingId}
        initialData={formData}
      />
      {modal}
    </div>
  )
}
