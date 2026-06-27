'use client'

import { useState } from 'react'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { Button } from '@/components/ui/button'
import { isIosDevice, isStandaloneMode } from '@/lib/pwa'

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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function PushPermissionBanner() {
  const { supported, permission, loading, subscribe } = usePushSubscription()
  const [dismissed, setDismissed] = useState(false)

  if (!supported || permission !== 'default' || dismissed) {
    return null
  }

  const showIosHint = isIosDevice() && !isStandaloneMode()

  return (
    <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        <div className="bg-blue-100 text-blue-600 rounded-full p-2 flex-shrink-0">
          <BellIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-900">Recibe alertas importantes</p>
          <p className="text-sm text-blue-800 mt-0.5">
            Activa las notificaciones para saber cuando haya pedidos urgentes, casos críticos o recordatorios del sistema.
          </p>
          {showIosHint && (
            <p className="text-xs text-blue-700 mt-2">
              En iPhone o iPad, primero añade esta app a tu pantalla de inicio para activar notificaciones push.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          type="button"
          size="sm"
          disabled={loading}
          onClick={subscribe}
        >
          {loading ? 'Activando...' : 'Activar notificaciones'}
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"
          aria-label="Cerrar banner"
          title="Cerrar"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
