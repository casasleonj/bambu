import Link from 'next/link'
import { derivarEstadoUI, derivarSiguientePaso, toUIEstadoInput } from '@/lib/embarque-ui-estado'
import type { Embarque, Pedido } from '../types'
import { derivarActividad } from './activity'

function ClosedPedidosSummary({ pedidos }: { pedidos: Pedido[] }) {
  const normales = pedidos.filter((p) => p.origen !== 'VENTA_LIBRE')
  const libres = pedidos.filter((p) => p.origen === 'VENTA_LIBRE')
  const parts: string[] = []
  if (normales.length > 0) parts.push(`${normales.length} entregados`)
  if (libres.length > 0) parts.push(`${libres.length} libres`)
  return <span>{pedidos.length} pedidos{parts.length > 0 ? ` (${parts.join(', ')})` : ''}</span>
}

/**
 * Tarjeta del Command Center (Fase 3).
 *
 * Evolución de `embarque-card.tsx`: además del badge de fase + capacidad,
 * muestra la fila de actividad (`_count` del ledger nuevo) y un CTA con el
 * siguiente paso derivado (`derivarSiguientePaso`). El CTA navega al detalle,
 * donde la acción real se ejecuta (Fases 4/5). Nada acá persiste estado.
 */
export function CommandCard({ embarque }: { embarque: Embarque }) {
  const cap = embarque.capacidadInfo
  const uiInput = toUIEstadoInput(embarque)
  const uiEstado = derivarEstadoUI(uiInput)
  const siguiente = derivarSiguientePaso(uiInput)
  const actividad = derivarActividad(embarque)

  return (
    <Link
      href={`/embarques/${embarque.id}`}
      className="block bg-white p-4 rounded-xl shadow hover:shadow-md transition border"
      data-testid="embarque-card"
    >
      <div className="flex justify-between items-start mb-2 min-w-0 gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold text-gray-800">
            #{embarque.numeroDia > 0 ? embarque.numeroDia : embarque.numero}
          </p>
          <p className="text-sm text-gray-500 truncate">{embarque.trabajador.nombre}</p>
          {embarque.ruta && <p className="text-xs text-blue-600 font-medium truncate">{embarque.ruta.nombre}</p>}
        </div>
        <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${uiEstado.badgeClass}`}>
          {uiEstado.label}
        </span>
      </div>

      {cap && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-2 ${cap.color}`}>
          <span className="text-lg">{cap.icon}</span>
          <div>
            <p className="text-sm font-medium">{cap.label}</p>
            <p className="text-xs">{cap.total} u. · {cap.pesoKg.toFixed(1)}kg / {cap.capacidadKg}kg</p>
          </div>
        </div>
      )}

      <div className="text-sm text-gray-600">
        {embarque.estado === 'CERRADO'
          ? <ClosedPedidosSummary pedidos={embarque.pedidos || []} />
          : <span>{embarque.pedidos?.length || 0} pedidos asignados</span>}
      </div>

      {actividad.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2" data-testid="command-card-actividad">
          {actividad.map((a) => (
            <span
              key={a.label}
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                a.alerta ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {a.alerta && <span aria-hidden="true">⚠️</span>}
              {a.count} {a.label}
            </span>
          ))}
        </div>
      )}

      {siguiente.label && (
        <div
          data-testid="command-card-cta"
          className="mt-3 flex items-center gap-1.5 text-sm font-medium text-blue-700"
        >
          <span aria-hidden="true">➜</span>
          <span>{siguiente.label}</span>
        </div>
      )}
    </Link>
  )
}
