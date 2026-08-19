'use client'

import type { RecoveryDecision } from './types'
import { getProductoIconConfig } from '@/lib/producto-iconos'

function formatHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function RecoveryPanel({ recovery }: { recovery: RecoveryDecision[] }) {
  if (recovery.length === 0) {
    return <p className="p-6 text-center text-sm text-gray-500">Sin sobrantes ni faltantes registrados todavía.</p>
  }

  return (
    <div className="divide-y divide-gray-100">
      {recovery.map((r) => {
        const { label: productoLabel } = getProductoIconConfig(r.producto)
        const esSobrante = r.tipo === 'SOBRANTE'
        return (
          <div key={r.id} className="p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                  esSobrante ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {esSobrante ? 'Sobrante' : 'Faltante'}
              </span>
              <span className="text-xs text-gray-400">{formatHora(r.createdAt)}</span>
            </div>
            <p className="text-sm text-gray-800 mt-1">
              <span className="font-semibold">{r.cantidadAplicada}</span> de {r.cantidad} {productoLabel} aplicadas
              {r.pedidoDestino && <span className="text-gray-500"> → pedido #{r.pedidoDestino.numero}</span>}
              {r.pedidoOrigen && <span className="text-gray-500"> · desde pedido #{r.pedidoOrigen.numero}</span>}
            </p>
            {esSobrante && r.sourceEvent && (
              <p className="text-xs text-gray-500 mt-0.5">
                Origen: {r.sourceEvent.tipo} de {r.sourceEvent.cantidad} {getProductoIconConfig(r.sourceEvent.producto).label} ({formatHora(r.sourceEvent.createdAt)})
              </p>
            )}
            <p className="text-xs text-gray-600 mt-1">{r.reason}</p>
          </div>
        )
      })}
    </div>
  )
}
