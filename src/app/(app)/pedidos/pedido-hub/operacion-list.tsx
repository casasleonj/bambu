'use client'

import { EmptyState } from '@/components/empty-state'
import { pedidoItemsResumen } from '../pedido-items'
import { deriveOperacion, origenLabel } from './derive-operacion'
import type { AccionKey, DeriveContext, Pedido } from './types'

const money = (n: number) => new Intl.NumberFormat('es-CO').format(Number(n) || 0)

interface OperacionListProps {
  pedidos: Pedido[]
  viewport: 'desktop' | 'mobile'
  hoyBogota: string
  /** contexto por pedido (N2 / excepción / cliente bloqueado). Opcional en 4a. */
  contextByPedido?: Record<string, Omit<DeriveContext, 'hoyBogota'>>
  onAccion: (pedido: Pedido, key: AccionKey) => void
  onOpen: (pedido: Pedido) => void
}

function clienteLinea(p: Pedido): string {
  const nombre = p.nombreNegocioCli || `${p.nombreCli}${p.apellidoCli ? ' ' + p.apellidoCli : ''}`
  return nombre
}

function pagoSenal(p: Pedido): string | null {
  if (p.estadoPago === 'ANTICIPADO') return 'anticipado'
  if (p.estadoPago === 'PARCIAL') return 'parcial'
  return null
}

function OperacionRowDesktop({
  pedido, hoyBogota, ctx, onAccion, onOpen,
}: {
  pedido: Pedido
  hoyBogota: string
  ctx: Omit<DeriveContext, 'hoyBogota'>
  onAccion: OperacionListProps['onAccion']
  onOpen: OperacionListProps['onOpen']
}) {
  const d = deriveOperacion(pedido, { ...ctx, hoyBogota })
  const origen = origenLabel(pedido.origen)
  const senal = pagoSenal(pedido)
  return (
    <tr
      data-testid={`operacion-row-${pedido.id}`}
      onClick={() => onOpen(pedido)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(pedido) }}
      className="cursor-pointer border-b hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
    >
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">#{pedido.numero}</span>
          {origen && (
            <span className="text-[10px] rounded-full border border-gray-300 px-1.5 py-0.5 text-gray-600">{origen}</span>
          )}
        </div>
        <div className="text-sm font-medium text-gray-800">{clienteLinea(pedido)}</div>
      </td>
      <td className="px-3 py-2 align-top text-sm text-gray-600">
        {pedido.canal === 'DOMICILIO' && <span className="mr-1" title="Domicilio">🚚</span>}
        {pedidoItemsResumen(pedido)}
      </td>
      <td className="px-3 py-2 align-top text-sm text-gray-700">{d.estadoLegible}</td>
      <td className="px-3 py-2 align-top text-right">
        <div className="text-sm font-semibold text-gray-800">${money(pedido.total)}</div>
        {senal && <div className="text-[11px] text-gray-500">{senal}</div>}
      </td>
      <td className="px-3 py-2 align-top text-right">
        {d.accionDestacada && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAccion(pedido, d.accionDestacada!.key) }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {d.accionDestacada.label}
          </button>
        )}
      </td>
    </tr>
  )
}

function OperacionCardMobile({
  pedido, hoyBogota, ctx, onAccion, onOpen,
}: {
  pedido: Pedido
  hoyBogota: string
  ctx: Omit<DeriveContext, 'hoyBogota'>
  onAccion: OperacionListProps['onAccion']
  onOpen: OperacionListProps['onOpen']
}) {
  const d = deriveOperacion(pedido, { ...ctx, hoyBogota })
  const origen = origenLabel(pedido.origen)
  return (
    <div
      data-testid={`operacion-row-${pedido.id}`}
      onClick={() => onOpen(pedido)}
      className="rounded-xl border border-gray-200 bg-white p-3"
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-800">{clienteLinea(pedido)}</div>
        <span className="text-xs text-gray-400">#{pedido.numero}</span>
      </div>
      <div className="mt-0.5 text-xs text-gray-500">
        {pedido.canal === 'DOMICILIO' && <span className="mr-1">🚚</span>}
        {pedidoItemsResumen(pedido)}
        {origen && <span className="ml-2 rounded-full border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600">{origen}</span>}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm text-gray-700">{d.estadoLegible}</span>
        <span className="text-sm font-semibold text-gray-800">${money(pedido.total)}</span>
      </div>
      {d.accionDestacada && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAccion(pedido, d.accionDestacada!.key) }}
          className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {d.accionDestacada.label}
        </button>
      )}
    </div>
  )
}

/**
 * Lista de operaciones del Pedido Hub. Responsive: tabla en desktop, tarjetas
 * en mobile (ALS §12: contexto → operación → total → CTA). 5 columnas por
 * defecto (blueprint §2.4). Estado como microcopy, no badges apilados.
 * En 4a la fila abre el modal de detalle legacy vía `onOpen`; el peek es 4b.
 */
export function OperacionList({
  pedidos, viewport, hoyBogota, contextByPedido, onAccion, onOpen,
}: OperacionListProps) {
  if (pedidos.length === 0) {
    return (
      <EmptyState
        title="No hay operaciones"
        description="Ajustá los filtros o creá una nueva operación."
      />
    )
  }

  const ctxFor = (id: string): Omit<DeriveContext, 'hoyBogota'> => contextByPedido?.[id] ?? {}

  if (viewport === 'mobile') {
    return (
      <div data-testid="pedido-hub-mobile" className="space-y-2">
        {pedidos.map((p) => (
          <OperacionCardMobile key={p.id} pedido={p} hoyBogota={hoyBogota} ctx={ctxFor(p.id)} onAccion={onAccion} onOpen={onOpen} />
        ))}
      </div>
    )
  }

  return (
    <div data-testid="pedido-hub-desktop" className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left">
        <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Operación</th>
            <th className="px-3 py-2 font-medium">Qué</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <OperacionRowDesktop key={p.id} pedido={p} hoyBogota={hoyBogota} ctx={ctxFor(p.id)} onAccion={onAccion} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
