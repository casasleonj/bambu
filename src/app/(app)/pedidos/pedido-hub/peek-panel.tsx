'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { deriveOperacion, origenLabel } from './derive-operacion'
import { pedidoItemsResumen, getItemsFromPedido } from '../pedido-items'
import { PeekRelaciones } from './peek-relaciones'
import type { PeekLayer2 } from './peek-cache'
import type { AccionKey, DeriveContext, Pedido } from './types'

const money = (n: number) => new Intl.NumberFormat('es-CO').format(Number(n) || 0)

interface PeekPanelProps {
  pedido: Pedido
  layer2: PeekLayer2 | null
  loadingLayer2: boolean
  errorLayer2: boolean
  viewport: 'desktop' | 'mobile'
  userRole: string | null
  hoyBogota: string
  onClose: () => void
  onNav: (dir: 'prev' | 'next') => void
  onAccion: (pedido: Pedido, key: AccionKey) => void
  onOpenVinculado: (id: string) => void
}

/**
 * Peek contextual del Pedido Hub (blueprint §3.4). Al lado de la lista
 * (desktop) o bottom sheet (mobile). Carga por capas: capa 1 instantánea,
 * capa 2 al abrir, capa 3 bajo demanda. `Escape` cierra; ↑/↓ recorren.
 */
export function PeekPanel({
  pedido, layer2, loadingLayer2, errorLayer2, viewport, userRole, hoyBogota,
  onClose, onNav, onAccion, onOpenVinculado,
}: PeekPanelProps) {
  const canSeePrecioOrigen = userRole === 'ADMIN' || userRole === 'ASISTENTE'

  const ctx: DeriveContext = {
    hoyBogota,
    tienePendienteN2: !!layer2?.pendienteN2,
    tieneExcepcion: (layer2?.casosAbiertos?.length ?? 0) > 0,
  }
  const d = deriveOperacion(pedido, ctx)
  const items = getItemsFromPedido(pedido)
  const origen = origenLabel(pedido.origen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); onNav('next') }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onNav('prev') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNav])

  const containerClass = viewport === 'mobile'
    ? 'fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t bg-white shadow-2xl'
    : 'w-full overflow-y-auto rounded-xl border border-gray-200 bg-white'
  const testId = viewport === 'mobile' ? 'peek-mobile' : 'peek-desktop'

  return (
    <div className={containerClass} data-testid={testId} role="dialog" aria-label={`Detalle del pedido #${pedido.numero}`}>
      {/* Header */}
      <div className="flex items-start justify-between border-b p-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">#{pedido.numero}</span>
            {origen && <span className="rounded-full border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600">{origen}</span>}
          </div>
          <div className="text-sm font-medium text-gray-800">{pedido.nombreNegocioCli || pedido.nombreCli}</div>
          <div className="text-xs text-gray-500">{d.estadoLegible}</div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onNav('prev')} aria-label="Anterior" className="rounded p-1 text-gray-400 hover:bg-gray-100">↑</button>
          <button type="button" onClick={() => onNav('next')} aria-label="Siguiente" className="rounded p-1 text-gray-400 hover:bg-gray-100">↓</button>
          <button type="button" onClick={onClose} aria-label="Cerrar" data-testid="peek-close" className="rounded p-1 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {/* Capa 1 — total / saldo / qué */}
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Total</span>
            <span className="text-lg font-bold text-gray-800">${money(pedido.total)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-gray-500">Pagado</span>
            <span className="text-green-600">${money(pedido.totalPagado)}</span>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase text-gray-400">Qué</div>
          <div className="text-sm text-gray-700">{pedidoItemsResumen(pedido)}</div>
        </div>

        {/* Acción destacada */}
        {d.accionDestacada && (
          <button
            type="button"
            onClick={() => onAccion(pedido, d.accionDestacada!.key)}
            data-testid="peek-accion-destacada"
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {d.accionDestacada.label}
          </button>
        )}

        {/* Capa 2 */}
        {loadingLayer2 && (
          <div className="animate-pulse space-y-2" data-testid="peek-layer2-loading">
            <div className="h-8 rounded bg-gray-100" />
            <div className="h-8 rounded bg-gray-100" />
          </div>
        )}
        {errorLayer2 && !loadingLayer2 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="peek-layer2-error">
            No se pudo cargar el contexto. Se reintenta al reconectar.
          </div>
        )}
        {layer2 && !loadingLayer2 && (
          <>
            {/* Desglose de items (precio-origen sujeto a permiso — §2.6) */}
            {canSeePrecioOrigen && items.length > 0 && (
              <div data-testid="peek-items-desglose">
                <div className="text-xs font-semibold uppercase text-gray-400">Productos</div>
                {items.map((it) => (
                  <div key={it.producto} className="flex justify-between text-sm text-gray-600">
                    <span>{it.cantPedido} {it.producto.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            )}
            <PeekRelaciones pedido={pedido} data={layer2} onOpenVinculado={onOpenVinculado} />
          </>
        )}

        {/* Capa 3 / detalle completo */}
        <Link
          href={`/pedidos/${pedido.id}`}
          className="block text-center text-xs text-blue-600 hover:underline"
          data-testid="peek-ver-detalle-completo"
        >
          Abrir detalle completo →
        </Link>
      </div>
    </div>
  )
}
