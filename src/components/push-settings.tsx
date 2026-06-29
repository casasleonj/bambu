'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { isIosDevice, isStandaloneMode } from '@/lib/pwa'
import { Button } from '@/components/ui/button'

const STATUS_LABELS: Record<string, string> = {
  default: 'Pendiente de permiso',
  granted: 'Permitido',
  denied: 'Bloqueado por el navegador',
  unknown: 'Desconocido',
}

function getDeniedHint(): string {
  if (isIosDevice()) {
    if (isStandaloneMode()) {
      return 'Safari no permite configurar notificaciones por sitio en modo standalone. Contactá al administrador del dispositivo.'
    }
    return 'En iPhone/iPad, primero añadí esta app a tu pantalla de inicio (Compartir → Añadir a inicio). Después podrás activar notificaciones.'
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/android/i.test(ua)) {
    return 'En Android: tocá el candado 🔒 junto a la URL → Notificaciones → Permitir. Si no aparece: ⋮ → Configuración del sitio → Notificaciones.'
  }
  return 'En tu navegador: hacé clic en el candado 🔒 de la barra de direcciones → Notificaciones → Permitir.'
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  )
}

interface PushSettingsProps {
  variant?: 'default' | 'compact'
  settingsHref?: string
}

function PushSettingsPlaceholder({ variant }: { variant: 'default' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400" aria-hidden="true">
        <BellIcon className="w-4 h-4" />
        <span>Notificaciones</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400" aria-hidden="true">
      <BellIcon className="w-5 h-5" />
      <span>Notificaciones push</span>
    </div>
  )
}

function getPushState(
  permission: NotificationPermission | 'unknown',
  subscribed: boolean,
  recovering: boolean,
) {
  if (recovering) {
    return {
      statusLabel: 'Restaurando...',
      statusClass: 'bg-blue-100 text-blue-800',
      buttonLabel: 'Restaurando...',
      disabled: true,
      hint: 'Estamos recuperando tu suscripción de notificaciones.',
    }
  }

  if (permission === 'denied') {
    return {
      statusLabel: 'Bloqueadas',
      statusClass: 'bg-red-100 text-red-800',
      buttonLabel: 'Bloqueado',
      disabled: true,
      hint: getDeniedHint(),
    }
  }

  if (permission === 'granted' && subscribed) {
    return {
      statusLabel: 'Activas',
      statusClass: 'bg-green-100 text-green-800',
      buttonLabel: 'Desactivar notificaciones',
      disabled: false,
      hint: 'Recibirás alertas importantes en este dispositivo.',
    }
  }

  if (permission === 'granted' && !subscribed) {
    return {
      statusLabel: 'Inactivas',
      statusClass: 'bg-amber-100 text-amber-800',
      buttonLabel: 'Restaurar suscripción',
      disabled: false,
      hint: 'El navegador ya permite notificaciones, pero no hay una suscripción activa. Presiona para restaurarla.',
    }
  }

  // permission === 'default' | 'unknown' or any other state
  return {
    statusLabel: 'Inactivas',
    statusClass: 'bg-amber-100 text-amber-800',
    buttonLabel: 'Activar notificaciones',
    disabled: false,
    hint: 'Activa las notificaciones para recibir alertas importantes.',
  }
}

export function PushSettings({ variant = 'default', settingsHref }: PushSettingsProps) {
  const [mounted] = useState(() => typeof document !== 'undefined')
  const { supported, permission, setPermission, subscribed, loading, recovering, error, subscribe, unsubscribe } =
    usePushSubscription()

  useEffect(() => {
    if (!mounted) return

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setPermission(Notification.permission)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [mounted, setPermission])

  if (!mounted) {
    return <PushSettingsPlaceholder variant={variant} />
  }

  const state = getPushState(permission, subscribed, recovering)

  if (!supported) {
    if (variant === 'compact') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <BellIcon className="w-4 h-4" />
          <span>No soportado</span>
        </div>
      )
    }
    return (
      <div className="text-sm text-gray-500 flex items-center gap-2">
        <BellIcon className="w-4 h-4" />
        <span>Las notificaciones push no están soportadas en este dispositivo.</span>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BellIcon className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-900">Notificaciones</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${state.statusClass}`}>
              {state.statusLabel}
            </span>
          </div>
          <Button
            type="button"
            variant={subscribed ? 'outline' : 'default'}
            size="sm"
            disabled={loading || state.disabled}
            onClick={subscribed ? unsubscribe : subscribe}
            aria-label={state.buttonLabel}
          >
            {loading ? '...' : state.buttonLabel}
          </Button>
        </div>
        {settingsHref && (
          <Link
            href={settingsHref}
            className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            Administrar
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
        <p className="text-xs text-gray-500">{state.hint}</p>

        {error && (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BellIcon className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-medium text-gray-900">Notificaciones push</span>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${state.statusClass}`}>
          {state.statusLabel}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        Permiso del navegador:{" "}
        <span className="font-medium text-gray-700">{STATUS_LABELS[permission] ?? permission}</span>
      </p>

      <p className="text-xs text-gray-600">{state.hint}</p>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant={subscribed ? 'outline' : 'default'}
        size="sm"
        disabled={loading || state.disabled}
        onClick={subscribed ? unsubscribe : subscribe}
        className="w-full sm:w-auto"
      >
        {loading ? 'Procesando...' : state.buttonLabel}
      </Button>
    </div>
  )
}
