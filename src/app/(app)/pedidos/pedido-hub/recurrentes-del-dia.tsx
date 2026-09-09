'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { generateUUID } from '@/lib/uuid'

type Decision = 'NORMAL' | 'CON_PENDIENTES' | 'SOLO_PENDIENTES' | 'APLICAR_CREDITO' | 'SALTAR'

interface Sugerencia {
  tipo: Decision
  label: string
  descripcion: string
  disabled?: boolean
  disabledReason?: string
}
interface PreviewItem {
  recurrenteId: string
  clienteNombre: string
  cadaNDias: number
  proximaFecha: string
  clienteBloqueado: boolean
  esDomingo: boolean
  cumpleMinimo: boolean
  sugerencias: Sugerencia[]
}

/**
 * "Generar los pedidos habituales de hoy" (Fase 8 F8-iv, blueprint §6.1, Q3).
 *
 * **CTA contextual** — solo aparece si hay recurrencias pendientes de generar.
 * El sistema **prepara** (preview: contexto, productos, cantidades, fecha,
 * pendientes, deuda, decisiones disponibles, advertencias); el usuario
 * **decide** por cada una (NORMAL / SALTAR / sugerencia). Nunca generación
 * silenciosa. Dedup por `recurrenteBatchId` (sin cambios en el backend).
 * El usuario nunca ve la palabra "plantilla".
 */
export function RecurrentesDelDia({ onGenerado }: { onGenerado?: () => void }) {
  const [items, setItems] = useState<PreviewItem[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [decisiones, setDecisiones] = useState<Record<string, Decision>>({})
  const [generando, setGenerando] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const cargar = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch('/api/pedidos/recurrentes', { signal: ctrl.signal, credentials: 'include' })
      const j = await res.json()
      if (ctrl.signal.aborted) return
      const p: PreviewItem[] = j?.success ? (j.preview ?? []) : []
      setItems(p)
      setDecisiones((prev) => {
        const next: Record<string, Decision> = {}
        for (const it of p) next[it.recurrenteId] = prev[it.recurrenteId] ?? (it.cumpleMinimo ? 'NORMAL' : 'SALTAR')
        return next
      })
    } catch {
      if (!ctrl.signal.aborted) setItems([])
    }
  }, [])

  // fetch-on-mount: la carga es async y el setState ocurre tras `await` (no
  // sincrónico); patrón estándar del repo para preview lazy.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => () => abortRef.current?.abort(), [])

  if (!items || items.length === 0) return null

  async function generar() {
    if (!items) return
    setGenerando(true)
    const decisionesArray = items.map((it) => ({ recurrenteId: it.recurrenteId, decision: decisiones[it.recurrenteId] ?? 'SALTAR' }))
    try {
      const res = await fetch('/api/pedidos/recurrentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decisiones: decisionesArray, offlineId: generateUUID() }),
      })
      const j = await res.json()
      if (j?.success) {
        toast.success(`${j.generados} generado${j.generados === 1 ? '' : 's'}, ${j.saltados} saltado${j.saltados === 1 ? '' : 's'}`)
        setAbierto(false)
        await cargar()
        onGenerado?.()
      } else {
        toast.error(j?.error?.message ?? j?.error ?? 'No se pudo generar')
      }
    } catch {
      toast.error('Sin conexión — reintentá cuando vuelva la red')
    } finally {
      setGenerando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        data-testid="recurrentes-del-dia-cta"
        className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-800 hover:bg-blue-100"
      >
        🔁 {items.length} pedido{items.length === 1 ? '' : 's'} habitual{items.length === 1 ? '' : 'es'} listo{items.length === 1 ? '' : 's'} para generar hoy — revisá y decidí
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm" data-testid="recurrentes-del-dia-panel">
      <div className="flex items-center justify-between">
        <span className="font-medium text-blue-900">Pedidos habituales de hoy</span>
        <button type="button" onClick={() => setAbierto(false)} className="text-[11px] text-gray-500">Cerrar</button>
      </div>

      <div className="mt-2 space-y-2">
        {items.map((it) => {
          const opciones: Sugerencia[] = it.sugerencias.length > 0
            ? it.sugerencias
            : [
                { tipo: 'NORMAL', label: 'Generar', descripcion: '', disabled: !it.cumpleMinimo, disabledReason: 'Mínimo 3 productos' },
                { tipo: 'SALTAR', label: 'Saltar', descripcion: '' },
              ]
          return (
            <div key={it.recurrenteId} className="rounded border border-gray-200 bg-white px-2 py-1.5" data-testid={`recurrente-item-${it.recurrenteId}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-800">{it.clienteNombre}</span>
                <span className="text-[10px] text-gray-400">cada {it.cadaNDias}d</span>
              </div>
              {(it.clienteBloqueado || it.esDomingo || !it.cumpleMinimo) && (
                <div className="mt-0.5 text-[10px] text-amber-700" data-testid={`recurrente-item-${it.recurrenteId}-aviso`}>
                  {it.clienteBloqueado && 'Cliente bloqueado. '}
                  {it.esDomingo && 'Cae domingo. '}
                  {!it.cumpleMinimo && 'Menos de 3 productos.'}
                </div>
              )}
              <select
                value={decisiones[it.recurrenteId] ?? 'SALTAR'}
                onChange={(e) => setDecisiones((d) => ({ ...d, [it.recurrenteId]: e.target.value as Decision }))}
                data-testid={`recurrente-item-${it.recurrenteId}-decision`}
                className="mt-1 w-full rounded border border-gray-300 px-1.5 py-0.5 text-[11px]"
              >
                {opciones.map((o) => (
                  <option key={o.tipo} value={o.tipo} disabled={o.disabled}>
                    {o.label}{o.disabled && o.disabledReason ? ` (${o.disabledReason})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={generar}
        disabled={generando}
        data-testid="recurrentes-del-dia-generar"
        className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
      >
        {generando ? 'Generando…' : 'Generar los seleccionados'}
      </button>
    </div>
  )
}
