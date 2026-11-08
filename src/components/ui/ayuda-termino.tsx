'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * «?» que explica un término en palabras sencillas (#601). Se abre con el cursor, con el teclado
 * (foco) y con un toque en el móvil; Escape o tocar fuera lo cierran. El término técnico queda en
 * la explicación, no en el texto principal.
 *
 * #696: con `disparador` el que se toca es ese texto (p. ej. «Pedido #1285», subrayado punteado) en lugar del «?»,
 * y la explicación respeta los saltos de línea. Sin `disparador` nada cambia.
 */
export function AyudaTermino({ texto, etiqueta = 'Qué significa', disparador }: { texto: string; etiqueta?: string; disparador?: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  // Solo con `disparador`: abierto por clic o toque. El cursor al salir no lo cierra; otro clic, Escape o tocar fuera sí.
  const fijo = useRef(false)
  const id = useId()
  const raiz = useRef<HTMLSpanElement>(null)
  const burbuja = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = () => { fijo.current = false; setAbierto(false) }
    const cerrarFuera = (e: Event) => { if (!raiz.current?.contains(e.target as Node)) cerrar() }
    // Escape cierra solo esta ayuda y no llega al panel o diálogo de abajo (capa superior primero, como useEscapeGuard).
    const cerrarEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar() } }
    document.addEventListener('pointerdown', cerrarFuera)
    document.addEventListener('keydown', cerrarEsc, true)
    return () => {
      document.removeEventListener('pointerdown', cerrarFuera)
      document.removeEventListener('keydown', cerrarEsc, true)
    }
  }, [abierto])

  // #696: con texto como disparador la explicación puede quedar pegada al borde de la pantalla: se corre lo justo
  // para que quepa (sin estado: se mueve el elemento ya medido).
  useLayoutEffect(() => {
    const el = burbuja.current
    if (!abierto || !disparador || !el) return
    el.style.transform = ''
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    const margen = 8
    const dx = r.right > window.innerWidth - margen ? window.innerWidth - margen - r.right : r.left < margen ? margen - r.left : 0
    if (dx !== 0) el.style.transform = `translateX(${dx}px)`
  }, [abierto, disparador])

  return (
    <span ref={raiz} className="relative inline-flex align-middle" onMouseEnter={() => setAbierto(true)} onMouseLeave={() => { if (!(disparador && fijo.current)) setAbierto(false) }}>
      <button
        type="button"
        aria-label={disparador ? undefined : etiqueta}
        aria-expanded={abierto}
        aria-describedby={abierto ? id : undefined}
        onClick={() => {
          if (!disparador) { setAbierto(v => !v); return }
          // Con texto como disparador, pasar el cursor (o tocar, que lo emula) ya lo abrió: el clic lo deja fijo.
          if (abierto && fijo.current) { fijo.current = false; setAbierto(false) } else { fijo.current = true; setAbierto(true) }
        }}
        className={disparador
          ? 'inline-flex min-h-6 items-center rounded text-blue-700 underline decoration-dotted underline-offset-4 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600'
          : 'inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 text-[11px] leading-none text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600'}
      >
        {disparador ?? '?'}
      </button>
      {abierto && (
        <span ref={burbuja} id={id} role="tooltip" className={`absolute top-6 z-30 rounded-lg ${disparador ? 'left-0 w-64 max-w-[80vw] whitespace-pre-line' : 'left-1/2 w-56 -translate-x-1/2'} bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg`}>
          {texto}
        </span>
      )}
    </span>
  )
}
