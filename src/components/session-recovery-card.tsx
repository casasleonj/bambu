'use client'
import { useEffect, useId, useRef } from 'react'

export function SessionRecoveryCard({
  onRetry,
  checking = false,
  logout = false,
  overlay = false,
}: {
  onRetry: () => void
  checking?: boolean
  logout?: boolean
  overlay?: boolean
}) {
  const titleId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    if (checking) panel.current?.focus()
    else button.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [checking])
  return (
    <div className={`${overlay ? 'fixed inset-0 z-[100]' : 'min-h-[100dvh]'} flex flex-col bg-gray-50`} data-testid="session-recovery">
      <div className="bg-blue-600 px-6 py-5 text-xl font-bold text-white">Agua Bambú</div>
      <div className="flex flex-1 items-center justify-center p-4">
        <section ref={panel} tabIndex={-1} role={overlay ? 'alertdialog' : undefined} aria-modal={overlay || undefined} aria-labelledby={titleId} className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg" aria-busy={checking} onKeyDown={(event) => {
          if (overlay && event.key === 'Tab') { event.preventDefault(); if (checking) panel.current?.focus(); else button.current?.focus() }
        }}>
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${checking ? 'bg-blue-100 text-blue-600' : 'bg-amber-50 text-amber-700'}`} aria-hidden="true">
            {checking ? <span className="h-7 w-7 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 motion-reduce:animate-none" /> : (
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10 4 2.6 17c-.8 1.4.1 3 1.7 3h15.4c1.6 0 2.5-1.6 1.7-3L14 4c-.8-1.4-2.8-1.4-3.6 0Z" /></svg>
            )}
          </div>
          <h2 id={titleId} className="mb-2 mt-4 text-xl font-bold text-gray-900" role="status">
            {checking ? 'Comprobando tu sesión' : logout ? 'No se pudo confirmar el cierre' : 'No pudimos comprobar tu sesión'}
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-gray-600">
            {checking ? 'Espera un momento mientras comprobamos el acceso.' : logout ? 'El servicio no respondió. Reintenta para confirmar el cierre de sesión.' : 'El servicio no está disponible en este momento. Reintenta en unos segundos.'}
          </p>
          <button ref={button} type="button" onClick={onRetry} disabled={checking} className="min-h-11 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
            {checking ? 'Comprobando…' : logout ? 'Reintentar cierre' : 'Reintentar'}
          </button>
        </section>
      </div>
    </div>
  )
}
