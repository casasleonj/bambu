'use client'

import { useEffect, useRef } from 'react'
import { usePushOptIn } from '@/hooks/use-push-opt-in'

const AUTO_DISMISS_MS = 8000

export function PushOptInToast() {
  const { shouldShow, accept, dismiss, loading, error } = usePushOptIn()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!shouldShow) return
    timeoutRef.current = setTimeout(() => {
      dismiss()
    }, AUTO_DISMISS_MS)
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [shouldShow, dismiss])

  if (!shouldShow) return null

  return (
    <div
      data-testid="push-opt-in-toast"
      role="status"
      aria-live="polite"
      className="fixed top-20 inset-x-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 bg-white border border-gray-200 shadow-lg rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">Recibí alertas al instante</p>
          <p className="text-xs text-gray-600 mt-1">
            Activá las notificaciones para enterarte cuando entren casos críticos.
          </p>
          {error && (
            <p className="text-xs text-red-600 mt-2" role="alert">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-gray-400 hover:text-gray-600 p-1"
          aria-label="Cerrar"
          data-testid="push-opt-in-dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={accept}
          disabled={loading}
          data-testid="push-opt-in-accept"
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Activando...' : 'Activar'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Más tarde
        </button>
      </div>
    </div>
  )
}
