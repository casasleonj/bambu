'use client'

import { usePushOptInContext } from '@/components/push-opt-in-provider'

/**
 * Franja de invitación a activar las notificaciones (#595). Va en el flujo del contenido,
 * justo bajo el encabezado: no flota sobre nada, así que no puede tapar ningún botón.
 * Se queda hasta que la persona decide (sin cuenta regresiva). «Más tarde» la cierra por
 * esta sesión y enciende la campana del encabezado; «✕» la descarta para siempre.
 */
export function PushOptInStrip() {
  const ctx = usePushOptInContext()
  if (!ctx || !ctx.stripVisible) return null

  const { status, blocked, accept, dismiss, remindLater, clearAttempt } = ctx

  const base =
    'flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-sm sm:px-6'

  if (status === 'success') {
    return (
      <div
        data-testid="push-opt-in-strip"
        role="status"
        aria-live="polite"
        className={`${base} border-emerald-200 bg-emerald-50 font-medium text-emerald-800`}
      >
        ✓ Listo: notificaciones activadas
      </div>
    )
  }

  if (status === 'activating') {
    return (
      <div
        data-testid="push-opt-in-strip"
        role="status"
        aria-live="polite"
        className={`${base} border-blue-100 bg-blue-50`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">Activando…</p>
          <p className="text-xs text-gray-600">Aceptá el permiso en tu navegador.</p>
        </div>
        <button
          type="button"
          disabled
          data-testid="push-opt-in-accept"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white opacity-60"
        >
          Activando…
        </button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        data-testid="push-opt-in-strip"
        role="alert"
        className={`${base} border-red-200 bg-red-50`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-red-900">No se pudieron activar</p>
          <p className="text-xs text-red-800">
            {blocked
              ? 'El navegador bloqueó las notificaciones. Podés habilitarlas desde el candado de la barra de direcciones.'
              : 'Algo falló al activar. Probá de nuevo en unos segundos.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!blocked && (
            <button
              type="button"
              onClick={accept}
              data-testid="push-opt-in-accept"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Reintentar
            </button>
          )}
          <button
            type="button"
            onClick={blocked ? clearAttempt : remindLater}
            data-testid="push-opt-in-later"
            className="rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-red-100"
          >
            {blocked ? 'Cerrar' : 'Más tarde'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="push-opt-in-strip"
      role="status"
      aria-live="polite"
      className={`${base} border-blue-100 bg-blue-50`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900">Recibí alertas al instante</p>
        <p className="text-xs text-gray-600">
          Activá las notificaciones para enterarte de los casos críticos.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={accept}
          data-testid="push-opt-in-accept"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Activar
        </button>
        <button
          type="button"
          onClick={remindLater}
          data-testid="push-opt-in-later"
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-blue-100"
        >
          Más tarde
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="No volver a mostrar"
          title="No volver a mostrar"
          data-testid="push-opt-in-dismiss"
          className="rounded p-1.5 text-gray-400 hover:bg-blue-100 hover:text-gray-600"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
