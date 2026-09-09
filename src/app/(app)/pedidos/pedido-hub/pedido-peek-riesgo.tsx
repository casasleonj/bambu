'use client'

import { GUIA_ALERTAS, type AlertaTipo } from '@/lib/alertas-config'
import type { PedidoPeekExtras } from '@/modules/pedidos/application/dto'

const TONO: Record<string, { box: string; titulo: string }> = {
  ALTA: { box: 'border-red-200 bg-red-50', titulo: 'text-red-800' },
  MEDIA: { box: 'border-amber-200 bg-amber-50', titulo: 'text-amber-800' },
  BAJA: { box: 'border-gray-200 bg-gray-50', titulo: 'text-gray-700' },
}

/**
 * Riesgo / excepciones en el peek (blueprint §5.3, plan Fase 7-i).
 *
 * **Señal ≠ Bloqueo ≠ Acusación.** Muestra los `Caso` abiertos del pedido
 * usando el texto oficial de la regla (`GUIA_ALERTAS` de `alertas-config.ts`) —
 * qué se detectó · por qué importa · qué se puede hacer. No redefine reglas,
 * no calcula riesgo, no juzga ("fraude"), no resuelve el caso: para eso está
 * `/casos` (frontera de dominio). El peek sólo explica y da acceso.
 */
export function PedidoPeekRiesgo({ casos }: { casos: PedidoPeekExtras['casosAbiertos'] }) {
  if (casos.length === 0) return null

  return (
    <div className="space-y-1.5" data-testid="peek-rel-casos">
      <div className="text-xs font-semibold text-gray-500">Requiere revisión</div>

      {casos.map((c) => {
        const guia = GUIA_ALERTAS[c.alertaTipo as AlertaTipo] as (typeof GUIA_ALERTAS)[AlertaTipo] | undefined
        const sev = (guia?.severidad ?? c.severidad ?? 'BAJA') as string
        const tono = TONO[sev] ?? TONO.BAJA

        return (
          <div key={c.id} className={`rounded-lg border px-3 py-2 text-[11px] ${tono.box}`} data-testid={`peek-caso-${c.id}`}>
            <div className={`text-xs font-medium ${tono.titulo}`}>
              {guia?.icono ? `${guia.icono} ` : ''}{guia?.nombre ?? c.alertaTipo.replace(/_/g, ' ')} · {c.status.toLowerCase()}
            </div>

            {guia && (
              <details className="mt-1 text-gray-700">
                <summary className="cursor-pointer text-gray-500">Qué significa</summary>
                <p className="mt-1">{guia.definicion}</p>
                {guia.soluciones[0] && (
                  <p className="mt-1"><span className="font-medium">Qué se puede hacer:</span> {guia.soluciones[0]}</p>
                )}
              </details>
            )}
          </div>
        )
      })}

      <p className="text-[10px] text-gray-400">
        Esto es una señal para revisión administrativa, no una acusación ni un bloqueo.
      </p>
      <a href="/casos" className="inline-block text-[11px] text-blue-600 hover:underline" data-testid="peek-caso-ver-casos">
        Ver en Casos →
      </a>
    </div>
  )
}
