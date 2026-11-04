'use client'

import { useEffect, useId, useRef, useState } from 'react'

/**
 * «?» que explica un término en palabras sencillas (#601). Se abre con el cursor, con el teclado
 * (foco) y con un toque en el móvil; Escape o tocar fuera lo cierran. El término técnico queda en
 * la explicación, no en el texto principal.
 */
export function AyudaTermino({ texto, etiqueta = 'Qué significa' }: { texto: string; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  const raiz = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!abierto) return
    const cerrarFuera = (e: Event) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false) }
    const cerrarEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', cerrarFuera)
    document.addEventListener('keydown', cerrarEsc)
    return () => {
      document.removeEventListener('pointerdown', cerrarFuera)
      document.removeEventListener('keydown', cerrarEsc)
    }
  }, [abierto])

  return (
    <span ref={raiz} className="relative inline-flex align-middle" onMouseEnter={() => setAbierto(true)} onMouseLeave={() => setAbierto(false)}>
      <button
        type="button"
        aria-label={etiqueta}
        aria-expanded={abierto}
        aria-describedby={abierto ? id : undefined}
        onClick={() => setAbierto(v => !v)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 text-[11px] leading-none text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        ?
      </button>
      {abierto && (
        <span id={id} role="tooltip" className="absolute left-1/2 top-6 z-30 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg">
          {texto}
        </span>
      )}
    </span>
  )
}
