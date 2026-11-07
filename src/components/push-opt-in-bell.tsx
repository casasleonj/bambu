'use client'

import { useState } from 'react'
import { usePushOptInContext } from '@/components/push-opt-in-provider'

/**
 * Campana de notificaciones en el encabezado (#595). Aparece cuando se pueden activar pero
 * la franja no está a la vista (tras «Más tarde» o «✕»). El punto naranja solo está si nunca
 * se descartó con «✕». Al tocarla abre un panel con «Activar».
 *
 * El panel se cierra con un «click catcher» (un div fijo transparente) y con Escape, igual
 * que el menú de usuario: un listener global en `document` re-renderizaba el encabezado
 * antes del click de la hamburguesa y dejaba el drawer sin abrir (ver header.tsx).
 */
export function PushOptInBell() {
  const ctx = usePushOptInContext()
  const [open, setOpen] = useState(false)
  if (!ctx || !ctx.showBell) return null

  const { bellHasDot, acceptFromPanel, status, blocked, panelActive, clearAttempt } = ctx
  // Un intento nacido en el panel mantiene el panel abierto para mostrar su resultado.
  const panelOpen = open || panelActive

  return (
    <div
      className="relative flex-shrink-0"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false)
          clearAttempt()
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Activar notificaciones"
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        data-testid="push-opt-in-bell"
        className={`relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-blue-700/60 ${
          panelOpen ? 'bg-blue-700/60' : 'bg-blue-700/40'
        }`}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {bellHasDot && (
          <span
            data-testid="push-opt-in-bell-dot"
            className="absolute right-2 top-2 h-2 w-2 rounded-full border border-blue-600 bg-amber-400"
          />
        )}
      </button>

      {panelOpen && (
        <>
          <div
            data-testid="push-opt-in-bell-backdrop"
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false)
              clearAttempt()
            }}
          />
          <div
            role="dialog"
            aria-label="Alertas al instante"
            data-testid="push-opt-in-panel"
            className="fixed inset-x-3 top-16 z-50 rounded-xl border border-gray-200 bg-white p-3 text-gray-900 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64"
          >
            {status === 'success' ? (
              <p role="status" className="text-sm font-medium text-emerald-700">
                ✓ Listo: notificaciones activadas
              </p>
            ) : status === 'activating' ? (
              <div role="status" aria-live="polite">
                <p className="text-sm font-semibold">Activando…</p>
                <p className="mt-1 text-xs text-gray-600">Aceptá el permiso en tu navegador.</p>
                <button
                  type="button"
                  disabled
                  data-testid="push-opt-in-panel-accept"
                  className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white opacity-60"
                >
                  Activando…
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold">
                  {status === 'error' ? 'No se pudieron activar' : 'Alertas al instante'}
                </p>
                {status === 'error' ? (
                  <p role="alert" className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
                    {blocked
                      ? 'El navegador bloqueó las notificaciones. Podés habilitarlas desde el candado de la barra de direcciones.'
                      : 'Algo falló. Probá de nuevo.'}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-600">Recibí un aviso cuando entren casos críticos.</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {!(status === 'error' && blocked) && (
                    <button
                      type="button"
                      onClick={() => void acceptFromPanel()}
                      data-testid="push-opt-in-panel-accept"
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      {status === 'error' ? 'Reintentar' : 'Activar'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      clearAttempt()
                    }}
                    data-testid="push-opt-in-panel-close"
                    className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
