'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { canReadFacturas } from '@/lib/permissions'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { formatCurrency } from '@/lib/utils'
import { deriveOperacion, origenLabel } from './derive-operacion'
import { PeekRelaciones } from './peek-relaciones'
import {
  TONOS_CLASE, itemsConsulta, lineaProducto, pillsEstado, responsablesConsulta,
} from './consulta-datos'
import type { AccionesConsulta } from './operacion-consulta'
import { fechaConsulta } from './fecha-consulta'
import type { PeekLayer2 } from './peek-cache'
import type { AccionKey, DeriveContext, Pedido } from './types'

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
  /** Fase 5-ii: tras una mutación N2, recargar el peek + refetch. */
  onMutadoN2?: () => void
  /** Consulta: permite «Ver factura» y conserva a dónde volver. Sin esto no se ofrece la factura. */
  acciones?: AccionesConsulta
}

/**
 * Peek contextual del Pedido Hub (blueprint §3.4). Al lado de la lista
 * (desktop) o bottom sheet (mobile). Carga por capas: capa 1 instantánea,
 * capa 2 al abrir, capa 3 bajo demanda. `Escape` cierra; ↑/↓ recorren.
 */
export function PeekPanel({
  pedido, layer2, loadingLayer2, errorLayer2, viewport, userRole, hoyBogota,
  onClose, onNav, onAccion, onOpenVinculado, onMutadoN2, acciones,
}: PeekPanelProps) {
  const canSeePrecioOrigen = userRole === 'ADMIN' || userRole === 'ASISTENTE'

  const ctx: DeriveContext = {
    hoyBogota,
    tienePendienteN2: !!layer2?.pendienteN2,
    tieneExcepcion: (layer2?.casosAbiertos?.length ?? 0) > 0,
  }
  const d = deriveOperacion(pedido, ctx)
  const items = itemsConsulta(pedido)
  const resp = responsablesConsulta(pedido, hoyBogota)
  const nombre = pedido.nombreNegocioCli || `${pedido.nombreCli}${pedido.apellidoCli ? ' ' + pedido.apellidoCli : ''}`
  const origen = origenLabel(pedido.origen)
  const swipeY = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); onNav('next') }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onNav('prev') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNav])

  const mobile = viewport === 'mobile'
  const containerClass = mobile
    ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t bg-white shadow-2xl'
    : 'w-full overflow-y-auto rounded-xl border border-gray-200 bg-white'
  const testId = mobile ? 'peek-mobile' : 'peek-desktop'
  const pills = pillsEstado(pedido, d)
  const saldo = Number(pedido.saldo)

  const panel = (
    <div className={containerClass} data-testid={testId} role="dialog" aria-label={`Detalle del pedido #${pedido.numero}`}>
      {mobile && (
        // Deslizar hacia abajo cierra la hoja (además del ✕ y de tocar el fondo).
        <div
          className="flex shrink-0 justify-center py-2"
          data-testid="peek-grab"
          onTouchStart={(e) => { swipeY.current = e.touches[0]?.clientY ?? null }}
          onTouchEnd={(e) => {
            const y0 = swipeY.current
            swipeY.current = null
            if (y0 != null && (e.changedTouches[0]?.clientY ?? y0) - y0 > 60) onClose()
          }}
        >
          <span className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
      )}
      {/* Header: mismo orden y etiquetas que la fila de la consulta */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-3 pb-2 pt-1">
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900 [overflow-wrap:anywhere]">{pedido.negocioId ? '🏪' : '👤'} {nombre}</div>
          <div className="text-xs text-gray-500">
            Pedido #{pedido.numero}
            {origen && <span className="ml-1.5 rounded-full border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600">{origen}</span>}
            {pedido.createdAt && <> · {fechaConsulta(pedido.createdAt, hoyBogota)}</>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1" data-testid="peek-pills">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pedido.canal === 'PUNTO' ? 'bg-amber-100 text-amber-900' : 'bg-violet-100 text-violet-800'}`}>
              {pedido.canal === 'PUNTO' ? '🏪 Punto' : '🚚 Domicilio'}
            </span>
            {pills.map((pl) => (
              <span key={pl.key} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONOS_CLASE[pl.tono]}`}>{pl.label}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!mobile && <button type="button" onClick={() => onNav('prev')} aria-label="Anterior" className="rounded p-1 text-gray-400 hover:bg-gray-100">↑</button>}
          {!mobile && <button type="button" onClick={() => onNav('next')} aria-label="Siguiente" className="rounded p-1 text-gray-400 hover:bg-gray-100">↓</button>}
          <button type="button" onClick={onClose} aria-label="Cerrar" data-testid="peek-close" className={`rounded text-gray-400 hover:bg-gray-100 ${mobile ? 'min-h-11 min-w-11 text-lg' : 'p-1'}`}>✕</button>
        </div>
      </div>

      <div className={`space-y-3 p-3 ${mobile ? 'min-h-0 flex-1 overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]' : ''}`}>
        {/* Productos: UNA sola lista (antes «Qué» y «Productos» repetían lo mismo) */}
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2" data-testid="peek-productos">
          {items.map((i, k) => {
            const { Icon, label } = getProductoIconConfig(i.producto)
            return (
              <div key={`${i.producto}-${k}`} className="border-t border-stone-200 py-1.5 text-xs first:border-0 first:pt-0 last:pb-0">
                <strong className="flex items-center gap-1 text-sm text-gray-800"><Icon size={16} />{label}</strong>
                <span className="text-gray-600" data-testid="peek-producto-linea">{lineaProducto(i, pedido)}</span>
              </div>
            )
          })}
          {items.length === 0 && <p className="text-xs text-stone-600">Sin productos registrados</p>}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-500" data-testid="peek-importes">
          <span>Importe<strong className="block text-sm text-gray-900">{formatCurrency(pedido.total)}</strong></span>
          <span>Pagado<strong className="block text-sm text-gray-900">{formatCurrency(Number(pedido.totalPagado))}</strong></span>
          <span>Saldo<strong className="block text-sm text-gray-900">{formatCurrency(saldo)}</strong></span>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="border-t pt-1.5" data-testid="peek-creacion">
            <div className="font-semibold text-gray-800">{resp.creacion.titulo}</div>
            <div className="text-gray-500">{resp.creacion.meta}</div>
          </div>
          <div className="border-t pt-1.5" data-testid="peek-entrega-quien">
            <div className="font-semibold text-gray-800">{resp.entrega.titulo}</div>
            <div className="text-gray-500">{resp.entrega.meta}</div>
          </div>
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
            <PeekRelaciones
              pedido={pedido}
              data={layer2}
              onOpenVinculado={onOpenVinculado}
              onAccionN2={(key) => onAccion(pedido, key)}
              onMutadoN2={onMutadoN2}
              puedeAjustar={canSeePrecioOrigen}
            />
          </>
        )}

        {/* Capa 3 / detalle completo */}
        <div className="flex flex-wrap gap-x-4 text-sm text-blue-600">
          <Link
            href={`/pedidos/${pedido.id}`}
            // Clic normal: abre el detalle encima de la lista sin recargar.
            // Con modificadores / botón del medio queda el href (otra pestaña).
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              onAccion(pedido, 'ver-detalle')
            }}
            className="inline-flex min-h-11 items-center hover:underline"
            data-testid="peek-ver-detalle-completo"
          >
            Ver pedido #{pedido.numero}
          </Link>
          {acciones && canReadFacturas(acciones.userRole) && pedido.factura?.id && (
            <a
              href={`/facturas?facturaId=${encodeURIComponent(pedido.factura.id)}&volver=${encodeURIComponent(acciones.volver)}`}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                acciones.onVerFactura(pedido)
              }}
              className="inline-flex min-h-11 items-center hover:underline"
              data-testid="peek-ver-factura"
            >
              Ver factura {pedido.factura.numero}
            </a>
          )}
        </div>
      </div>
    </div>
  )

  // Móvil: fondo atenuado; tocar fuera cierra la hoja.
  if (!mobile) return panel
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" data-testid="peek-backdrop" onClick={onClose} aria-hidden="true" />
      {panel}
    </>
  )
}
