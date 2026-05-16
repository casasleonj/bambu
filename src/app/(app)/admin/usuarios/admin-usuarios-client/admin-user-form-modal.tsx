import { useState, useEffect } from 'react'
import { Modal } from '@/components/modal'
import type { AdminUser } from './types'

const ROL_OPTIONS = ['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR', 'SELLADOR']
const ROL_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ASISTENTE: 'Asistente',
  CONTADOR: 'Contador',
  REPARTIDOR: 'Repartidor',
  SELLADOR: 'Sellador',
}

export function AdminUserFormModal({
  open,
  onClose,
  onSaved,
  user,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  user: AdminUser | null
}) {
  const [isCreate, setIsCreate] = useState(false)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [username, setUsername] = useState('')
  const [rol, setRol] = useState('ASISTENTE')
  const [activo, setActivo] = useState(true)
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) {
      setIsCreate(true)
      setNombre('')
      setApellido('')
      setUsername('')
      setRol('ASISTENTE')
      setActivo(true)
      setPassword('')
    } else {
      setIsCreate(false)
      setNombre(user.nombre)
      setApellido(user.apellido)
      setUsername(user.username)
      setRol(user.rol)
      setActivo(user.activo)
      setPassword('')
    }
    setFormError('')
  }, [user, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)

    try {
      if (isCreate) {
        if (!password) {
          setFormError('Contraseña requerida para crear usuario')
          setSubmitting(false)
          return
        }
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, rol, password, nombre, apellido }),
        })
        if (res.ok) {
          onSaved()
          onClose()
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error?.message || 'Error al crear usuario')
        }
      } else {
        const body: Record<string, unknown> = {}
        if (nombre !== user!.nombre) body.nombre = nombre
        if (apellido !== user!.apellido) body.apellido = apellido
        if (username !== user!.username) body.username = username
        if (rol !== user!.rol) body.rol = rol
        if (activo !== user!.activo) body.activo = activo
        if (password) body.password = password

        if (Object.keys(body).length === 0) {
          setFormError('No hay cambios para guardar')
          setSubmitting(false)
          return
        }

        const res = await fetch(`/api/users/${user!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          onSaved()
          onClose()
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error?.message || 'Error al actualizar usuario')
        }
      }
    } catch {
      setFormError('Error de conexión al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">{isCreate ? 'Nuevo Usuario' : 'Editar Usuario'}</h2>
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="user-nombre" className="block text-sm font-medium mb-1">Nombre *</label>
            <input
              id="user-nombre"
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="user-apellido" className="block text-sm font-medium mb-1">Apellido</label>
            <input
              id="user-apellido"
              type="text"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label htmlFor="user-username" className="block text-sm font-medium mb-1">Usuario (login) *</label>
          <input
            id="user-username"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label htmlFor="user-rol" className="block text-sm font-medium mb-1">Rol</label>
          <select
            id="user-rol"
            required
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            {ROL_OPTIONS.map(r => (
              <option key={r} value={r}>{ROL_LABELS[r]}</option>
            ))}
          </select>
        </div>

        {!isCreate && (
          <div className="flex items-center gap-2">
            <input
              id="user-activo"
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="user-activo" className="text-sm font-medium text-gray-700">
              Usuario activo
            </label>
          </div>
        )}

        <hr className="border-gray-200" />

        <div>
          <label htmlFor="user-password" className="block text-sm font-medium mb-1">
            {isCreate ? 'Contraseña *' : 'Nueva contraseña'}
            {!isCreate && <span className="text-xs text-gray-500"> (dejar vacio para mantener actual)</span>}
          </label>
          <input
            id="user-password"
            type="password"
            required={isCreate}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : (isCreate ? 'Crear Usuario' : 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
