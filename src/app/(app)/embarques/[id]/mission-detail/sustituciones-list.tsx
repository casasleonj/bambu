'use client'

import { getProductoIconConfig } from '@/lib/producto-iconos'
import { TIPO_STYLES } from '../ledger-client/movimiento-timeline'

/**
 * Fase 6b — lista de sustituciones del embarque.
 *
 * Cada sustitución es la UNIDAD de negocio "el cliente devolvió una unidad
 * defectuosa y recibió una nueva": el backend persiste DOS movimientos físicos
 * separados (RETORNO VEHICULO→INSPECCION + ENTREGA VEHICULO→CLIENTE) y un
 * registro `Sustitucion` que los vincula. Acá se muestran los dos movimientos.
 */

export interface SustitucionMovimiento {
  tipo: string
  producto: string
  cantidad: number
  origen: string | null
  destino: string | null
  createdAt: string
}

export interface SustitucionUI {
  id: string
  embarqueId: string
  pedidoId: string | null
  createdAt: string
  autorizadoPor: { id: string; nombre: string } | null
  movimientoRecepcion: SustitucionMovimiento
  movimientoEntrega: SustitucionMovimiento
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function MovimientoFila({ movimiento }: { movimiento: SustitucionMovimiento }) {
  const style = TIPO_STYLES[movimiento.tipo as keyof typeof TIPO_STYLES] ?? {
    label: movimiento.tipo,
    badge: 'bg-gray-100 text-gray-600',
    sign: '·' as const,
  }
  const { label: productoLabel } = getProductoIconConfig(movimiento.producto)
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}>
        {style.label}
      </span>
      <span className="text-gray-700">
        <span className="font-semibold">{movimiento.cantidad}</span> {productoLabel}
      </span>
      {(movimiento.origen || movimiento.destino) && (
        <span className="text-gray-400">· {movimiento.origen ?? '—'} → {movimiento.destino ?? '—'}</span>
      )}
    </div>
  )
}

export function SustitucionesList({ sustituciones }: { sustituciones: SustitucionUI[] }) {
  if (sustituciones.length === 0) {
    return <p className="p-6 text-center text-sm text-gray-500">Sin sustituciones registradas todavía.</p>
  }

  return (
    <div className="divide-y divide-gray-100">
      {sustituciones.map((s) => {
        const producto = s.movimientoRecepcion.producto
        const cantidad = s.movimientoRecepcion.cantidad
        const { label: productoLabel } = getProductoIconConfig(producto)
        return (
          <div key={s.id} className="p-3.5" data-testid="sustitucion-row">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-800">
                Sustitución
              </span>
              <span className="text-sm font-medium text-gray-800">
                {cantidad} {productoLabel}
              </span>
              {s.autorizadoPor && (
                <span className="text-xs text-gray-400">por {s.autorizadoPor.nombre}</span>
              )}
              <span className="text-xs text-gray-400">{formatHora(s.createdAt)}</span>
            </div>
            <div className="space-y-1 pl-1" data-testid="sustitucion-movimientos">
              <MovimientoFila movimiento={s.movimientoRecepcion} />
              <MovimientoFila movimiento={s.movimientoEntrega} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
