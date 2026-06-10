'use client'

import { useState, useEffect, useActionState } from 'react'
import { authenticate } from '@/lib/auth-actions'
import { AuthShell } from '@/components/auth-shell'

/**
 * Mobile keyboard fix: cuando el teclado virtual aparece, iOS Safari NO
 * scrollea automaticamente al input activo si el contenedor usa
 * `flex items-center` con altura fija. Llamamos scrollIntoView en onFocus
 * y, si visualViewport esta disponible, una vez mas cuando el viewport
 * se redimensiona (cuando el teclado termina de subir). Event-driven, sin
 * setTimeout magico. Ver AGENTS.md "Known Issues" — Bug teclado virtual.
 */
function handleInputFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.target.scrollIntoView({ block: 'center' })
  const vv = window.visualViewport
  if (!vv) return
  const onResize = () => {
    e.target.scrollIntoView({ block: 'center' })
    vv.removeEventListener('resize', onResize)
  }
  vv.addEventListener('resize', onResize, { once: true })
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showDevHint, setShowDevHint] = useState(false)
  const [errorMessage, formAction, isPending] = useActionState(authenticate, undefined)

  useEffect(() => {
    setShowDevHint(process.env.NODE_ENV === 'development')
  }, [])

  return (
    <AuthShell title="Agua Bambú" subtitle="Sistema de Gestión">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="username" value={username} />
        <input type="hidden" name="password" value={password} />

        <div>
          <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 mb-2">
            Usuario
          </label>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            autoFocus
            enterKeyHint="next"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onFocus={handleInputFocus}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            placeholder="Ingrese usuario"
            required
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={handleInputFocus}
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="Ingrese contraseña"
              required
              aria-describedby={errorMessage || showDevHint ? 'login-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {(errorMessage || (showDevHint && process.env.NODE_ENV === 'development')) && (
          <div id="login-error" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm" role="alert">
            {errorMessage || 'Modo desarrollo — usa las credenciales del seed.'}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {isPending ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </AuthShell>
  )
}
