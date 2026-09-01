'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'
import type { PlanExcepcion } from '../plan-types'

const SEV_STYLE: Record<string, string> = {
  ALTA: 'border-red-200 bg-red-50',
  MEDIA: 'border-amber-200 bg-amber-50',
  BAJA: 'border-gray-200 bg-gray-50',
}
const SEV_DOT: Record<string, string> = {
  ALTA: 'bg-red-500',
  MEDIA: 'bg-amber-500',
  BAJA: 'bg-gray-400',
}

/**
 * Bandeja de excepciones (v4 §39). Separa "lo que necesita atención" del plan
 * propuesto. Cada excepción: problema + qué propone el sistema + resolver/ignorar.
 */
export function ExcepcionesBay({
  planId,
  expectedUpdatedAt,
  excepciones,
  disabled,
  onResuelta,
}: {
  planId: string
  expectedUpdatedAt: string
  excepciones: PlanExcepcion[]
  disabled: boolean
  onResuelta: () => void | Promise<void>
}) {
  const [pendiente, setPendiente] = useState<string | null>(null)

  async function resolver(excepcionId: string, resolucion: 'RESUELTA' | 'IGNORADA') {
    setPendiente(excepcionId)
    const r = await fetchResilient(`/api/rutas/planes/${planId}`, {
      method: 'PATCH',
      body: { expectedUpdatedAt, op: { tipo: 'resolverExcepcion', excepcionId, resolucion } },
      localEndpoint: 'rutas-plan-excepcion',
    })
    setPendiente(null)
    if (r.status === 'ok') {
      toast.success(resolucion === 'IGNORADA' ? 'Excepción ignorada' : 'Excepción marcada resuelta')
      await onResuelta()
    } else if (r.status === 'error' && r.statusCode === 409) {
      toast.error('El plan cambió. Recargá la página.')
    } else {
      toast.error('No se pudo actualizar la excepción')
    }
  }

  return (
    <section className="space-y-2" data-testid="rutas-excepciones">
      <h2 className="text-sm font-semibold text-gray-700">
        {excepciones.length} asunto{excepciones.length !== 1 ? 's' : ''} requiere{excepciones.length === 1 ? '' : 'n'} atención
      </h2>
      {excepciones.map((e) => (
        <div key={e.id} className={`rounded-lg border p-3 ${SEV_STYLE[e.severidad]}`}>
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEV_DOT[e.severidad]}`} />
            <div className="flex-1">
              <p className="text-sm text-gray-800">{e.explicacion}</p>
              {e.opciones && e.opciones.length > 0 && (
                <ul className="mt-1 text-xs text-gray-500 list-disc list-inside">
                  {e.opciones.map((o) => (
                    <li key={o.accion}>{o.label}</li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => resolver(e.id, 'RESUELTA')}
                  disabled={disabled || pendiente === e.id}
                  className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {pendiente === e.id ? '…' : 'Marcar resuelta'}
                </button>
                <button
                  onClick={() => resolver(e.id, 'IGNORADA')}
                  disabled={disabled || pendiente === e.id}
                  className="text-xs px-2 py-1 text-gray-500 rounded hover:bg-white disabled:opacity-50"
                >
                  Ignorar
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}
