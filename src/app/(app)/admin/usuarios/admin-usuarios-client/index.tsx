'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import type { AdminUser } from './types'
import { AdminUserCard } from './admin-user-card'
import { AdminUserFormModal } from './admin-user-form-modal'
import { PasswordResultModal } from './password-result-modal'

export default function AdminUsuariosClient({ users: initialUsers }: { users: AdminUser[] }) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers)
  const { confirm, modal } = useConfirm()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [resetResult, setResetResult] = useState<{ open: boolean; password: string; userName: string }>({
    open: false,
    password: '',
    userName: '',
  })

  async function fetchUsers() {
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error('Error al cargar usuarios')
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      toast.error('Error cargando usuarios')
    }
  }

  const filtered = users.filter(u => {
    const term = search.toLowerCase()
    return (
      u.username.toLowerCase().includes(term) ||
      u.nombre.toLowerCase().includes(term) ||
      u.apellido.toLowerCase().includes(term) ||
      u.rol.toLowerCase().includes(term) ||
      u.trabajador?.nombre.toLowerCase().includes(term)
    )
  })

  function openCreate() {
    setEditingUser(null)
    setShowModal(true)
  }

  function openEdit(user: AdminUser) {
    setEditingUser(user)
    setShowModal(true)
  }

  async function handleToggleStatus(user: AdminUser) {
    if (user.activo) {
      const ok = await confirm({
        message: 'Desactivar este usuario? No podra iniciar sesion.',
        variant: 'destructive',
        confirmLabel: 'Desactivar',
      })
      if (!ok) return
    } else {
      const ok = await confirm('Reactivar este usuario?')
      if (!ok) return
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !user.activo }),
      })
      if (res.ok) {
        fetchUsers()
        toast.success(user.activo ? 'Usuario desactivado' : 'Usuario reactivado')
      } else {
        const data = await res.json()
        toast.error(data.error?.message || 'Error al actualizar')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  async function handleResetPassword(user: AdminUser) {
    const displayName = `${user.nombre} ${user.apellido}`.trim() || user.username
    const ok = await confirm({
      message: `Generar nueva contraseña para ${displayName}?`,
      description: 'El usuario deberá usar esta contraseña para iniciar sesión. Se mostrará una sola vez.',
      variant: 'warning',
      confirmLabel: 'Generar contraseña',
    })
    if (!ok) return

    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, { method: 'PATCH' })
      const data = await res.json()
      if (res.ok) {
        setResetResult({
          open: true,
          password: data.password,
          userName: displayName,
        })
        toast.success('Contraseña reseteada')
      } else {
        toast.error(data.error?.message || 'Error al resetear contraseña')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Usuarios del Sistema</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Nuevo Usuario
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre, usuario, rol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              title="No hay usuarios"
              description="Aun no hay usuarios registrados en el sistema"
              actionLabel="+ Crear Usuario"
              onAction={openCreate}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No se encontraron resultados para "{search}"</p>
            <button onClick={() => setSearch('')} className="mt-2 text-sm text-blue-600 hover:underline">
              Limpiar busqueda
            </button>
          </div>
        ) : (
          filtered.map(u => (
            <AdminUserCard
              key={u.id}
              user={u}
              onEdit={openEdit}
              onToggleStatus={handleToggleStatus}
              onResetPassword={handleResetPassword}
            />
          ))
        )}
      </div>

      <AdminUserFormModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingUser(null) }}
        onSaved={fetchUsers}
        user={editingUser}
      />
      <PasswordResultModal
        open={resetResult.open}
        onClose={() => setResetResult({ open: false, password: '', userName: '' })}
        password={resetResult.password}
        userName={resetResult.userName}
      />
      {modal}
    </div>
  )
}
