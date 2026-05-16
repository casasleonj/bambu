'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const ROL_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ASISTENTE: 'Asistente',
  CONTADOR: 'Contador',
  REPARTIDOR: 'Repartidor',
  SELLADOR: 'Sellador',
}

const ROL_COLORS: Record<string, string> = {
  ADMIN: 'bg-yellow-100 text-yellow-800',
  ASISTENTE: 'bg-green-100 text-green-800',
  CONTADOR: 'bg-purple-100 text-purple-800',
  REPARTIDOR: 'bg-orange-100 text-orange-800',
  SELLADOR: 'bg-blue-100 text-blue-800',
}

const ROL_HEADER_COLORS: Record<string, string> = {
  ADMIN: 'bg-yellow-500',
  ASISTENTE: 'bg-green-500',
  CONTADOR: 'bg-purple-500',
  REPARTIDOR: 'bg-orange-500',
  SELLADOR: 'bg-blue-500',
}

interface UserProfile {
  id: string
  username: string
  nombre: string
  apellido: string
  rol: string
  activo: boolean
  createdAt: string
  trabajador?: { nombre: string } | null
}

type FieldState = 'idle' | 'saving' | 'saved' | 'error'

export default function MiPerfilClient({ user }: { user: UserProfile }) {
  const { update: updateSession } = useSession()

  // Original data for dirty tracking and reset
  const [original, setOriginal] = useState(user)

  // Form state
  const [nombre, setNombre] = useState(user.nombre)
  const [apellido, setApellido] = useState(user.apellido)
  const [username, setUsername] = useState(user.username)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [showPasswordFields, setShowPasswordFields] = useState(false)
  const [saveState, setSaveState] = useState<FieldState>('idle')

  // Dirty tracking
  const isDirtyNombre = nombre !== original.nombre
  const isDirtyApellido = apellido !== original.apellido
  const isDirtyUsername = username !== original.username
  const hasPasswordFields = !!(currentPassword || newPassword || confirmNewPassword)
  const hasDirtyPersonal = isDirtyNombre || isDirtyApellido
  const hasDirtyAccount = isDirtyUsername
  const canSave = hasDirtyPersonal || hasDirtyAccount || (showPasswordFields && hasPasswordFields)

  // Auto-expand password when user starts typing
  useEffect(() => {
    if (currentPassword && !showPasswordFields) {
      setShowPasswordFields(true)
    }
  }, [currentPassword, showPasswordFields])

  // Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (canSave && !submitting) {
          const form = document.getElementById('perfil-form') as HTMLFormElement
          form?.requestSubmit()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canSave, submitting])

  const displayName = `${nombre} ${apellido}`.trim() || username
  const avatarInitial = (nombre?.charAt(0) || username?.charAt(0) || 'U').toUpperCase()
  const avatarColor = ROL_HEADER_COLORS[user.rol] || 'bg-gray-500'

  const handleReset = useCallback(() => {
    setNombre(original.nombre)
    setApellido(original.apellido)
    setUsername(original.username)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmNewPassword('')
    setShowPasswordFields(false)
    setSaveState('idle')
    toast.info('Cambios descartados')
  }, [original])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return

    if (showPasswordFields && newPassword !== confirmNewPassword) {
      toast.error('Las contraseñas nuevas no coinciden')
      return
    }

    setSubmitting(true)
    setSaveState('saving')
    try {
      const body: Record<string, string> = {}
      if (isDirtyNombre) body.nombre = nombre
      if (isDirtyApellido) body.apellido = apellido
      if (isDirtyUsername) body.username = username
      if (showPasswordFields) {
        body.currentPassword = currentPassword
        body.newPassword = newPassword
        body.confirmNewPassword = confirmNewPassword
      }

      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (res.ok) {
        const updated = data.user as UserProfile
        setOriginal(updated)
        setSaveState('saved')
        toast.success('Perfil actualizado')

        if (isDirtyUsername || isDirtyNombre || isDirtyApellido) {
          await updateSession()
        }

        setCurrentPassword('')
        setNewPassword('')
        setConfirmNewPassword('')
        setShowPasswordFields(false)

        setTimeout(() => setSaveState('idle'), 2000)
      } else {
        setSaveState('error')
        toast.error(data.error?.formErrors?.[0] || data.error?.message || 'Error al actualizar')
      }
    } catch {
      setSaveState('error')
      toast.error('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  const DirtyBadge = ({ dirty }: { dirty: boolean }) =>
    dirty ? (
      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Modificado
      </span>
    ) : null

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      {/* Profile Header */}
      <div className="flex items-center gap-4">
        <div
          className={`w-16 h-16 rounded-full ${avatarColor} flex items-center justify-center text-2xl font-bold text-white shadow-md`}
        >
          {avatarInitial}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          <p className="text-sm text-gray-500">@{username}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROL_COLORS[user.rol] || 'bg-gray-100 text-gray-800'}`}
            >
              {ROL_LABELS[user.rol] || user.rol}
            </span>
            {user.activo ? (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Activo
              </span>
            ) : (
              <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Inactivo
              </span>
            )}
          </div>
        </div>
      </div>

      <form id="perfil-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Datos Personales */}
        <Card className={hasDirtyPersonal ? 'border-amber-300' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <CardTitle className="text-lg">Datos Personales</CardTitle>
                  <p className="text-sm text-muted-foreground">Tu nombre y apellido</p>
                </div>
              </div>
              {saveState === 'saved' && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Guardado
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="nombre" className="text-sm font-medium">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <DirtyBadge dirty={isDirtyNombre} />
              </div>
              <input
                id="nombre"
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg transition ${
                  isDirtyNombre ? 'border-amber-400 bg-amber-50/30' : 'border-gray-300'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="apellido" className="text-sm font-medium">Apellido</label>
                <DirtyBadge dirty={isDirtyApellido} />
              </div>
              <input
                id="apellido"
                type="text"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg transition ${
                  isDirtyApellido ? 'border-amber-400 bg-amber-50/30' : 'border-gray-300'
                }`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Cuenta */}
        <Card className={hasDirtyAccount ? 'border-amber-300' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-lg">Cuenta</CardTitle>
                <p className="text-sm text-muted-foreground">Información de inicio de sesión</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="username" className="text-sm font-medium">Usuario (login)</label>
                <DirtyBadge dirty={isDirtyUsername} />
              </div>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg transition ${
                  isDirtyUsername ? 'border-amber-400 bg-amber-50/30' : 'border-gray-300'
                }`}
              />
              <p className="text-xs text-gray-500 mt-1">Este es el nombre con el que inicias sesión</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Rol:</span>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROL_COLORS[user.rol] || 'bg-gray-100 text-gray-800'}`}
              >
                {ROL_LABELS[user.rol] || user.rol}
              </span>
            </div>

            {user.trabajador && (
              <div className="text-sm text-gray-600">
                Vinculado a: <span className="font-medium">{user.trabajador.nombre}</span>
              </div>
            )}

            <div className="text-sm text-gray-500">
              Cuenta creada el: {new Date(user.createdAt).toLocaleDateString('es-CO', { dateStyle: 'long' })}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Seguridad */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg text-red-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-lg">Seguridad</CardTitle>
                <p className="text-sm text-muted-foreground">Cambia tu contraseña</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium mb-1">
                Contraseña actual
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={showPasswordFields ? '' : 'Escribe aquí para cambiar tu contraseña'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              {!showPasswordFields && currentPassword && (
                <p className="text-xs text-blue-600 mt-1">Completa los campos de abajo para confirmar el cambio</p>
              )}
            </div>

            {showPasswordFields && (
              <>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium mb-1">
                    Nueva contraseña <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
                </div>
                <div>
                  <label htmlFor="confirmNewPassword" className="block text-sm font-medium mb-1">
                    Confirmar nueva contraseña <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="confirmNewPassword"
                    type="password"
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg transition ${
                      confirmNewPassword && newPassword !== confirmNewPassword
                        ? 'border-red-400 bg-red-50/30'
                        : 'border-gray-300'
                    }`}
                  />
                  {confirmNewPassword && newPassword !== confirmNewPassword && (
                    <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
                  )}
                  {confirmNewPassword && newPassword === confirmNewPassword && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Coinciden
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            {hasDirtyPersonal || hasDirtyAccount ? (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Cambios sin guardar
              </span>
            ) : saveState === 'saved' ? (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Perfil guardado
              </span>
            ) : null}
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleReset}
              disabled={submitting || (!hasDirtyPersonal && !hasDirtyAccount && !hasPasswordFields)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !canSave}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Guardando...
                </span>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-right">Ctrl+S para guardar</p>
      </form>
    </div>
  )
}
