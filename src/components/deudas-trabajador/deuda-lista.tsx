'use client'

import { formatCurrency } from '@/lib/utils'
import type { DeudaItem, DeudasTrabajador } from '@/lib/deuda-trabajador-resumen'
import type { EstadoCarga } from './use-deudas'

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' })
}

function PedidoCelda({ item }: { item: DeudaItem }) {
  if (!item.pedido) return <span className="text-gray-400">— <span className="text-xs">(no viene de un pedido)</span></span>
  return (
    <span>
      Pedido #{item.pedido.numero}
      <span className="block text-xs text-gray-500">{item.pedido.cliente}</span>
    </span>
  )
}

/**
 * Lista de deudas pendientes, solo lectura: tabla en pantallas anchas, tarjetas en móvil.
 * Los estados de carga y error viven aquí para que el detalle y Mi perfil se vean igual.
 */
export function DeudaLista({
  estado,
  datos,
  onReintentar,
}: {
  estado: EstadoCarga
  datos: DeudasTrabajador | null
  onReintentar: () => void
}) {
  if (estado === 'cargando') {
    return (
      <div className="p-4 space-y-2" aria-label="Cargando deuda" data-testid="deuda-cargando">
        {[0, 1, 2].map((i) => <div key={i} className="h-5 rounded bg-gray-200 animate-pulse" />)}
      </div>
    )
  }
  if (estado === 'error' || !datos) {
    return (
      <div role="alert" className="p-4 space-y-2 text-sm text-gray-600" data-testid="deuda-error">
        <p>No se pudo cargar la deuda. Revisa tu conexión e inténtalo de nuevo.</p>
        <button
          type="button"
          onClick={onReintentar}
          className="px-3 py-2 rounded-lg border border-blue-600 bg-blue-50 text-blue-700 font-semibold min-h-[40px]"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div data-testid="deuda-lista">
      <div className="px-4 py-3 bg-orange-50 text-orange-800 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm">Total pendiente · {datos.cantidad} {datos.cantidad === 1 ? 'deuda' : 'deudas'}</span>
        <b className="text-xl tabular-nums" data-testid="deuda-total">{formatCurrency(datos.totalPendiente)}</b>
      </div>

      <div className="hidden md:block overflow-x-auto" data-testid="deuda-tabla">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-4 pt-3 pb-1 font-medium">Fecha</th>
              <th className="px-4 pt-3 pb-1 font-medium">Concepto</th>
              <th className="px-4 pt-3 pb-1 font-medium">Pedido</th>
              <th className="px-4 pt-3 pb-1 font-medium text-right">Total</th>
              <th className="px-4 pt-3 pb-1 font-medium text-right">Falta pagar</th>
            </tr>
          </thead>
          <tbody>
            {datos.items.map((i) => (
              <tr key={`${i.origen}-${i.id}`} className="border-t align-top" data-testid="deuda-fila">
                <td className="px-4 py-2.5 whitespace-nowrap">{fechaCorta(i.fecha)}</td>
                <td className="px-4 py-2.5">
                  {i.concepto}
                  {i.detalle && <span className="block text-xs text-gray-500">{i.detalle}</span>}
                </td>
                <td className="px-4 py-2.5"><PedidoCelda item={i} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(i.total)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold">{formatCurrency(i.pendiente)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden divide-y" data-testid="deuda-tarjetas">
        {datos.items.map((i) => (
          <li key={`${i.origen}-${i.id}`} className="px-4 py-3 space-y-1">
            <div className="flex justify-between gap-3">
              <b>{i.concepto}</b>
              <b className="tabular-nums">{formatCurrency(i.pendiente)}</b>
            </div>
            {i.detalle && <p className="text-xs text-gray-500">{i.detalle}</p>}
            <div className="text-sm"><PedidoCelda item={i} /></div>
            <p className="text-xs text-gray-500">
              {fechaCorta(i.fecha)} · Total {formatCurrency(i.total)}
              {i.pendiente < i.total ? ` · Falta ${formatCurrency(i.pendiente)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
