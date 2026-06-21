'use client'

import { usePushSubscription } from '@/hooks/use-push-subscription'
import { Button } from '@/components/ui/button'

const STATUS_LABELS: Record<string, string> = {
  default: 'Pendiente de permiso',
  granted: 'Permitido',
  denied: 'Bloqueado por el navegador',
  unknown: 'Desconocido',
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

export function PushSettings() {
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } = usePushSubscription()

  if (!supported) {
    return (
      <div className="text-sm text-gray-500 flex items-center gap-2">
        <BellIcon className="w-4 h-4" />
        <span>Las notificaciones push no están soportadas en este dispositivo.</span>
      </div>
    )
  }

  const isDenied = permission === 'denied'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BellIcon className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-medium text-gray-900">Notificaciones push</span>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            subscribed
              ? 'bg-green-100 text-green-800'
              : isDenied
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {subscribed ? 'Activas' : isDenied ? 'Bloqueadas' : 'Inactivas'}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        Permiso del navegador: <span className="font-medium text-gray-700">{STATUS_LABELS[permission] ?? permission}</span>
      </p>

      {isDenied && (
        <p className="text-xs text-red-600">
          El permiso fue bloqueado. Para activar notificaciones, habilítalas en la configuración del navegador y vuelve a intentar.
        </p>
      )}

      <Button
        type="button"
        variant={subscribed ? 'outline' : 'default'}
        size="sm"
        disabled={loading || isDenied}
        onClick={subscribed ? unsubscribe : subscribe}
        className="w-full sm:w-auto"
      >
        {loading ? 'Procesando...' : subscribed ? 'Desactivar notificaciones' : 'Activar notificaciones'}
      </Button>
    </div>
  )
}
