'use client'

import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'

export interface PedidoReviewProps {
  preview: PreviewPedidoResult
  motivo: string
  onMotivoChange: (v: string) => void
  onConfirm: () => void
  onVolver: () => void
}

const ESTADO_PAGO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', PAGADO: 'Pagado', ANTICIPADO: 'Anticipado',
}

/**
 * PedidoReview (blueprint §5.3, nivel "alto impacto" / ALS §10) — el paso
 * `REVIEW` del flujo de acción sensible `INTENT → PREVIEW → IMPACT →
 * [AUTHORIZATION] → COMMIT`. Muestra el impacto (del preview del backend, no
 * recalculado) + las señales de alto impacto y exige un **motivo** antes de
 * continuar. Se activa cuando `preview.requiresAuthorization` es true (hoy
 * siempre false: la política de umbral es PENDIENTE DE NEGOCIO §8.2 — el
 * paso queda listo para cuando esa política exista).
 */
export function PedidoReview({ preview, motivo, onMotivoChange, onConfirm, onVolver }: PedidoReviewProps) {
  const c = preview.calculation
  const señalesAlto = preview.riskSignals.filter((s) => s.severidad === 'ALTA')

  return (
    <section
      data-testid="workspace-review"
      className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm"
    >
      <div>
        <p className="font-semibold text-red-800">Esta operación requiere revisión</p>
        {preview.authorizationPolicy && (
          <p className="text-xs text-red-700">{preview.authorizationPolicy}</p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
        <dt>Total</dt><dd className="text-right font-medium">${c.total.toLocaleString()}</dd>
        <dt>Saldo proyectado</dt><dd className="text-right font-medium">${c.saldoProyectado.toLocaleString()}</dd>
        <dt>Estado de pago</dt><dd className="text-right">{ESTADO_PAGO_LABEL[c.estadoPagoProyectado] ?? c.estadoPagoProyectado}</dd>
      </dl>

      {señalesAlto.length > 0 && (
        <ul className="ml-4 list-disc text-xs text-red-700" data-testid="review-senales-alto">
          {señalesAlto.map((s) => <li key={s.tipo}>{s.detalle}</li>)}
        </ul>
      )}

      <label className="block">
        <span className="text-xs font-medium text-gray-700">Motivo (obligatorio)</span>
        <textarea
          data-testid="review-motivo"
          value={motivo}
          onChange={(e) => onMotivoChange(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Explicá por qué esta operación procede"
        />
      </label>

      <div className="flex items-center justify-between">
        <button type="button" data-testid="review-volver" onClick={onVolver} className="text-xs text-gray-500">
          Volver a editar
        </button>
        <button
          type="button"
          data-testid="review-confirmar"
          disabled={motivo.trim().length === 0}
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          Entiendo · continuar
        </button>
      </div>
    </section>
  )
}
