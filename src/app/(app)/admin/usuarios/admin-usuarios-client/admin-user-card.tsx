import { Badge } from '@/components/ui/badge'
import type { AdminUser } from './types'

const labels: Record<string, string> = {
  ADMIN: 'Admin',
  ASISTENTE: 'Asistente',
  CONTADOR: 'Contador',
  REPARTIDOR: 'Repartidor',
  SELLADOR: 'Sellador',
}

const colors: Record<string, string> = {
  ADMIN: 'bg-yellow-100 text-yellow-800',
  ASISTENTE: 'bg-green-100 text-green-800',
  CONTADOR: 'bg-purple-100 text-purple-800',
  REPARTIDOR: 'bg-orange-100 text-orange-800',
  SELLADOR: 'bg-blue-100 text-blue-800',
}

export function AdminUserCard({
  user,
  onEdit,
  onToggleStatus,
  onResetPassword,
}: {
  user: AdminUser
  onEdit: (u: AdminUser) => void
  onToggleStatus: (u: AdminUser) => void
  onResetPassword: (u: AdminUser) => void
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {user.nombre || user.apellido ? `${user.nombre} ${user.apellido}`.trim() : user.username}
          </h2>
          <p className="text-xs text-zinc-500">@{user.username}</p>
          <div className="mt-1 flex gap-1.5">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors[user.rol] || 'bg-gray-100 text-gray-800'}`}>
              {labels[user.rol] || user.rol}
            </span>
            <Badge variant={user.activo ? 'default' : 'destructive'}>
              {user.activo ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 text-sm text-zinc-600">
        {user.trabajador && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-500">Vinculado a:</span>
            <span>{user.trabajador.nombre}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-500">Creado:</span>
          <span>{new Date(user.createdAt).toLocaleDateString('es-CO')}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={() => onEdit(user)}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
        >
          Editar
        </button>
        <button
          onClick={() => onResetPassword(user)}
          className="inline-flex items-center justify-center rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
          title="Resetear contraseña"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </button>
        <button
          onClick={() => onToggleStatus(user)}
          className={`inline-flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
            user.activo
              ? 'bg-red-50 text-red-700 hover:bg-red-100'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          {user.activo ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>
    </div>
  )
}
