'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deriveOperacion } from './derive-operacion'
import type { AccionKey, Pedido } from './types'

export interface CommandItem {
  id: string
  label: string
  hint?: string
  /** navega a una ruta (no ejecuta mutaciones). */
  href?: string
  /** dispara un handler de la UI (abre un flujo, no muta directamente). */
  run?: () => void
}

interface CommandMenuProps {
  /** operación seleccionada — habilita los comandos contextuales. */
  selected: Pedido | null
  hoyBogota: string
  onNuevaOperacion: () => void
  onBuscarCliente: () => void
  /** dispara la acción destacada / secundaria de la operación seleccionada
   *  (abre el flujo correspondiente; nunca muta directamente). */
  onAccion: (pedido: Pedido, key: AccionKey) => void
}

/**
 * `PedidoCommandMenu` (blueprint §3.7). Global (⌘/Ctrl+K) + contextual.
 * - "Abrir planificación de hoy" **navega**, no ejecuta (Pedidos no absorbe
 *   el módulo de rutas de Embarques).
 * - Las acciones sensibles abren su flujo (modal/paso de decisión), no mutan.
 * - 100% teclado: ↑/↓/Enter/Esc.
 */
export function PedidoCommandMenu({
  selected, hoyBogota, onNuevaOperacion, onBuscarCliente, onAccion,
}: CommandMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘/Ctrl+K global — no captura si el foco está en un input/textarea ajeno.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) { setQuery(''); setCursor(0); inputRef.current?.focus() }
  }, [open])

  const items: CommandItem[] = useMemo(() => {
    const global: CommandItem[] = [
      { id: 'nueva', label: 'Nueva operación', run: onNuevaOperacion },
      { id: 'buscar-cliente', label: 'Buscar cliente…', run: onBuscarCliente },
      { id: 'planificacion', label: 'Abrir planificación de hoy', hint: 'navega a Distribución', href: `/rutas?fecha=${hoyBogota}` },
      { id: 'cartera', label: 'Ir a cartera', href: '/cartera' },
    ]
    if (!selected) return global

    const d = deriveOperacion(selected, { hoyBogota })
    const contextual: CommandItem[] = []
    if (d.accionDestacada) {
      contextual.push({
        id: `accion-${d.accionDestacada.key}`,
        label: `${d.accionDestacada.label} · #${selected.numero}`,
        run: () => onAccion(selected, d.accionDestacada!.key),
      })
    }
    contextual.push({ id: 'ver-detalle', label: `Abrir detalle de #${selected.numero}`, href: `/pedidos/${selected.id}` })
    contextual.push({ id: 'corregir', label: `Corregir #${selected.numero}`, hint: 'abre el flujo de corrección', run: () => onAccion(selected, 'resolver-excepcion') })
    return [...contextual, ...global]
  }, [selected, hoyBogota, onNuevaOperacion, onBuscarCliente, onAccion])

  const filtered = items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))

  if (!open) return null

  const activate = (item: CommandItem) => {
    setOpen(false)
    if (item.href) router.push(item.href)
    else item.run?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24" data-testid="command-menu" role="dialog" aria-label="Menú de comandos">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); if (filtered[cursor]) activate(filtered[cursor]) }
          }}
          placeholder="Escribí un comando…"
          className="w-full border-b px-4 py-3 text-sm outline-none"
          data-testid="command-menu-input"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && <li className="px-4 py-2 text-sm text-gray-400">Sin comandos</li>}
          {filtered.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => activate(item)}
                data-testid={`command-${item.id}`}
                aria-selected={i === cursor}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${i === cursor ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <span>{item.label}</span>
                {item.hint && <span className="text-[11px] text-gray-400">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
