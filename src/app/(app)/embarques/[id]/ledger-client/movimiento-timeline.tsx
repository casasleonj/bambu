'use client'

import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { Movimiento, TipoMovimiento } from './types'

const TIPO_STYLES: Record<TipoMovimiento, { label: string; badge: string; sign: '+' | '-' | '·' }> = {
  CARGA: { label: 'Carga', badge: 'bg-green-100 text-green-800', sign: '+' },
  RECARGA: { label: 'Recarga', badge: 'bg-green-100 text-green-800', sign: '+' },
  ENTREGA: { label: 'Entrega', badge: 'bg-blue-100 text-blue-800', sign: '-' },
  VENTA_RUTA: { label: 'Venta en ruta', badge: 'bg-purple-100 text-purple-800', sign: '-' },
  RETORNO: { label: 'Retorno', badge: 'bg-amber-100 text-amber-800', sign: '-' },
  REEMPAQUE: { label: 'Reempaque', badge: 'bg-gray-100 text-gray-700', sign: '·' },
  DESCARTE: { label: 'Descarte', badge: 'bg-red-100 text-red-800', sign: '-' },
  CUSTODY_TRANSFER: { label: 'Transferencia', badge: 'bg-sky-100 text-sky-800', sign: '·' },
  PROMOCION: { label: 'Promoción', badge: 'bg-pink-100 text-pink-800', sign: '-' },
  AJUSTE_AUTORIZADO: { label: 'Ajuste autorizado', badge: 'bg-orange-100 text-orange-800', sign: '·' },
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function MovimientoTimeline({ movimientos }: { movimientos: Movimiento[] }) {
  if (movimientos.length === 0) {
    return <p className="p-6 text-center text-sm text-gray-500">Sin movimientos registrados todavía.</p>
  }

  return (
    <div className="divide-y divide-gray-100">
      {movimientos.map((m) => {
        const style = TIPO_STYLES[m.tipo]
        const { label: productoLabel, Icon } = getProductoIconConfig(m.producto)
        const effect = (m.metadata as { effect?: string } | null)?.effect
        return (
          <div key={m.id} className="p-3.5 flex items-start gap-3 hover:bg-gray-50">
            <div className="mt-0.5">
              <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}>
                  {style.label}
                </span>
                {effect && (
                  <span className={`text-[10px] font-semibold ${effect === 'INCREASE' ? 'text-green-600' : 'text-red-600'}`}>
                    {effect === 'INCREASE' ? '↑ aumenta' : '↓ reduce'}
                  </span>
                )}
                <span className="text-xs text-gray-400">{formatHora(m.createdAt)}</span>
              </div>
              <p className="text-sm text-gray-800 mt-0.5">
                <span className="font-semibold">{style.sign !== '·' ? style.sign : ''}{m.cantidad}</span> {productoLabel}
                {(m.origen || m.destino) && (
                  <span className="text-gray-500"> · {m.origen ?? '—'} → {m.destino ?? '—'}</span>
                )}
              </p>
              {m.authorization && <p className="text-xs text-gray-500 mt-0.5">Autorización: {m.authorization}</p>}
              {m.autorizador && <p className="text-xs text-gray-400">Por {m.autorizador.nombre}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
