'use client'

// #646 — Desplegable para listas largas del cierre: cerrado muestra título, cantidad e importe; abierto, el detalle.
// Usa <details>/<summary> (teclado y lector de pantalla nativos) y deja el «?» sin abrir/cerrar la lista.
// #665: en pantallas angostas el título ocupa todo el ancho y el resumen (cantidad e importe) va en una segunda línea;
// desde 640 px el resumen va a la derecha en la misma línea. Sin insignias sueltas: la cantidad va dentro del resumen.

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { cn } from '@/lib/utils'

export type TonoDesplegable = 'gris' | 'verde' | 'rojo' | 'ambar' | 'azul' | 'violeta'

const TONOS: Record<TonoDesplegable, { caja: string; icono: string }> = {
  gris: { caja: 'border-slate-200 bg-white', icono: 'bg-slate-100' },
  verde: { caja: 'border-green-200 bg-white', icono: 'bg-green-100' },
  rojo: { caja: 'border-red-200 bg-white', icono: 'bg-red-100' },
  ambar: { caja: 'border-amber-300 bg-amber-50', icono: 'bg-amber-100' },
  azul: { caja: 'border-blue-200 bg-white', icono: 'bg-blue-100' },
  violeta: { caja: 'border-violet-200 bg-white', icono: 'bg-violet-100' },
}

export function Desplegable({ id, icono, titulo, resumen, ayuda, tono = 'gris', abierto = false, testid, children }: {
  id?: string
  icono: string
  titulo: string
  /** Cantidad e importe, siempre visibles aunque esté cerrado (puede traer varias líneas o etiquetas). */
  resumen?: ReactNode
  ayuda?: string
  tono?: TonoDesplegable
  abierto?: boolean
  testid?: string
  children: ReactNode
}) {
  const t = TONOS[tono]
  return (
    <details id={id} data-testid={testid} open={abierto} className={cn('group rounded-xl border', t.caja)}>
      <summary className="grid cursor-pointer list-none grid-cols-[1.75rem_minmax(0,1fr)_1rem] items-center gap-x-2 gap-y-0.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto_1rem] [&::-webkit-details-marker]:hidden">
        <span aria-hidden className={cn('row-span-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm sm:row-span-1', t.icono)}>{icono}</span>
        <span className="col-start-2 min-w-0">
          {titulo}
          {ayuda && (
            <span onClick={(e) => { e.preventDefault(); e.stopPropagation() }} className="ml-1 inline-flex align-middle">
              <AyudaTermino texto={ayuda} />
            </span>
          )}
        </span>
        {resumen !== undefined && (
          <span data-testid="desplegable-resumen" className="col-start-2 row-start-2 min-w-0 text-xs font-semibold text-slate-600 sm:col-start-3 sm:row-start-1 sm:whitespace-nowrap sm:text-right">{resumen}</span>
        )}
        <ChevronDown aria-hidden className="col-start-3 row-span-2 row-start-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180 sm:col-start-4 sm:row-span-1" />
      </summary>
      <div className="border-t border-slate-100 px-3 pb-3 pt-2 text-xs">{children}</div>
    </details>
  )
}

/** Muestra las primeras `limite` filas y «Ver las N restantes» para el resto (listas largas). */
export function ListaLimitada<T>({ items, limite = 5, render, plural = 'restantes', singular = 'restante' }: {
  items: readonly T[]
  limite?: number
  render: (item: T, indice: number) => ReactNode
  plural?: string
  singular?: string
}) {
  const [todo, setTodo] = useState(false)
  const visibles = todo ? items : items.slice(0, limite)
  const faltan = items.length - visibles.length
  return (
    <>
      {visibles.map((it, i) => render(it, i))}
      {faltan > 0 && (
        <button type="button" onClick={() => setTodo(true)} data-testid="ver-restantes"
          className="mt-2 block w-full rounded-lg border border-dashed border-slate-300 py-2 text-center text-xs font-semibold text-blue-700 hover:bg-blue-50">
          Ver {faltan === 1 ? 'el' : 'los'} {faltan} {faltan === 1 ? singular : plural} ▾
        </button>
      )}
    </>
  )
}
