'use client'

import type { PedidoPeekExtras } from '@/modules/pedidos/application/dto'

function fmtFecha(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Evidencia de la entrega en el peek (blueprint §6.2, plan Fase 7-ii).
 * Dato **propio del Pedido** — no fusiona dominios. Links a Maps / foto que
 * abren en pestaña nueva (acceso, no navegación de la lista). `null` → nada.
 */
export function PeekEntrega({ entrega }: { entrega: PedidoPeekExtras['entregaResumen'] }) {
  if (!entrega) return null
  const fecha = fmtFecha(entrega.fecha)
  const tieneCoords = entrega.gpsLat != null && entrega.gpsLng != null

  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm" data-testid="peek-rel-entrega">
      <div className="text-xs font-medium text-gray-500">Entrega</div>
      {fecha && <div className="text-gray-700" data-testid="peek-entrega-fecha">{fecha}</div>}
      <div className="mt-0.5 flex gap-3 text-[11px]">
        {tieneCoords && (
          <a
            href={`https://www.google.com/maps?q=${entrega.gpsLat},${entrega.gpsLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
            data-testid="peek-entrega-ubicacion"
          >
            Ver ubicación →
          </a>
        )}
        {entrega.fotoUrl && (
          <a
            href={entrega.fotoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
            data-testid="peek-entrega-foto"
          >
            Ver foto →
          </a>
        )}
      </div>
    </div>
  )
}
