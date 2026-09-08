'use client'

import { GUIA_ALERTAS, getBadgeColor, type AlertaTipo, type GuiaAlerta } from '@/lib/alertas-config'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'

/** orden de despliegue: lo más severo primero. */
const SEVERIDAD_ORDEN: Record<string, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 }

/**
 * `warnings` que el backend usa para poner `canCreate=false` (el commit ya
 * queda deshabilitado por `allowedActions`; acá se explica el porqué).
 */
const WARNING_BLOQUEANTE = new Set(['CLIENTE_BLOQUEADO', 'FIADO_SOBRE_LIMITE'])

export interface PedidoRiskSignalsProps {
  warnings: PreviewPedidoResult['warnings']
  riskSignals: PreviewPedidoResult['riskSignals']
}

/**
 * PedidoRiskSignals (blueprint §5.3) — riesgo/antifraude **en el flujo**.
 *
 * Señal ≠ Bloqueo ≠ Autorización. Este componente **explica**
 * (qué se detectó · por qué importa · qué puedes hacer) consumiendo las
 * reglas ya definidas en `alertas-config.ts` (`GUIA_ALERTAS`) — no las
 * redefine ni predice cálculos. El backend (`POST /api/pedidos/preview`)
 * es la autoridad: los `warnings` bloqueantes ya deshabilitan el commit
 * vía `preview.allowedActions`. Sin `[Solicitar autorización]` mientras
 * `requiresAuthorization` sea siempre `false` (política PENDIENTE DE NEGOCIO).
 */
export function PedidoRiskSignals({ warnings, riskSignals }: PedidoRiskSignalsProps) {
  if (warnings.length === 0 && riskSignals.length === 0) return null

  const señales = [...riskSignals].sort(
    (a, b) => (SEVERIDAD_ORDEN[a.severidad] ?? 3) - (SEVERIDAD_ORDEN[b.severidad] ?? 3),
  )

  return (
    <section data-testid="workspace-risk-signals" className="space-y-2">
      {warnings.map((w) => {
        const bloqueante = WARNING_BLOQUEANTE.has(w.code)
        return (
          <div
            key={w.code}
            data-testid={`risk-warning-${w.code}`}
            className={`rounded-lg border px-3 py-2 text-xs ${
              bloqueante ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            <span className="mr-1">{bloqueante ? '🔒' : '⚠️'}</span>
            {w.message}
          </div>
        )
      })}

      {señales.map((s) => {
        const guia: GuiaAlerta | undefined = GUIA_ALERTAS[s.tipo as AlertaTipo]
        return (
          <details
            key={s.tipo}
            data-testid={`risk-signal-${s.tipo}`}
            className={`rounded-lg border px-3 py-2 text-xs ${getBadgeColor(s.severidad)}`}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <span>{guia?.icono ?? '•'}</span>
              <span className="font-semibold">{guia?.nombre ?? s.tipo}</span>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wide">{s.severidad}</span>
            </summary>
            <div className="mt-2 space-y-1.5 border-t border-black/10 pt-2 text-[11px]">
              <p><span className="font-medium">Qué se detectó:</span> {s.detalle}</p>
              {guia?.comoSeAplica && (
                <p><span className="font-medium">Por qué importa:</span> {guia.comoSeAplica}</p>
              )}
              {guia && guia.soluciones.length > 0 && (
                <div>
                  <span className="font-medium">Qué puedes hacer:</span>
                  <ul className="ml-4 list-disc">
                    {guia.soluciones.map((sol, i) => <li key={i}>{sol}</li>)}
                  </ul>
                </div>
              )}
              <p className="pt-1 italic opacity-70">Es una señal para revisión, no un bloqueo ni una acusación.</p>
            </div>
          </details>
        )
      })}
    </section>
  )
}
