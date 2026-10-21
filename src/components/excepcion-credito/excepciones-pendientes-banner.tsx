'use client'

import { formatCurrency } from '@/lib/utils'
import type { ExcepcionPendiente } from './use-excepciones-pendientes'

interface Props {
  excepciones: ExcepcionPendiente[]
  onRevisar: (id: string) => void
}

function hace(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`
}

/** Aviso en /pedidos para quien puede autorizar excepciones de crédito (P0-3, PR 2). */
export function ExcepcionesPendientesBanner({ excepciones, onRevisar }: Props) {
  if (excepciones.length === 0) return null
  const n = excepciones.length
  return (
    <section
      data-testid="excepciones-pendientes"
      aria-label="Solicitudes de excepción de crédito"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {n === 1 ? '1 solicitud de excepción de crédito espera' : `${n} solicitudes de excepción de crédito esperan`} tu decisión
        </p>
        <button
          type="button"
          onClick={() => onRevisar(excepciones[0].id)}
          data-testid="excepciones-revisar"
          className="min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700"
        >
          Revisar
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {excepciones.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onRevisar(e.id)}
              data-testid={`excepcion-fila-${e.id}`}
              className="flex w-full min-w-0 items-center justify-between gap-3 border-t border-amber-200 pt-1 text-left"
            >
              <span className="min-w-0 truncate">
                {e.cliente.nombre} · pidió {e.solicitadoPor.nombre} · {formatCurrency(e.operacionSaldoSnapshot)}
              </span>
              <span className="shrink-0 text-xs font-semibold">{hace(e.solicitadoAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
