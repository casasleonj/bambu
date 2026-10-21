'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'
import type { ExcepcionVista } from './use-excepcion-credito'

export interface PedidoCreditoPanelProps {
  credito: PreviewPedidoResult['credito']
  /** el preview levantó el bloqueo con la excepción del borrador. */
  excepcionAplicada: boolean
  /** hay una excepción autorizada que ya no cubre esta operación (vencida / saldo mayor). */
  excepcionNoAplica: PreviewPedidoResult['excepcionNoAplica']
  vista: ExcepcionVista | null
  solicitando: boolean
  error: string | null
  total: number
  onSolicitar: (motivo: string, nota: string) => void
  /** descartar la solicitud actual para pedir otra. */
  onReiniciar: () => void
  /** llevar al usuario a la zona de cobro. */
  onCobrarAhora: () => void
}

/**
 * Panel "Límite de crédito" del workspace (P0-3, maqueta 1 del Hub).
 *
 * No decide nada: los números y el bloqueo vienen del preview (Autoridad de
 * Crédito F1) y la excepción se pide/decide en el servidor. Excepción ≠ aumento
 * de límite: vale para ESTA venta, hasta el saldo autorizado y solo hoy.
 */
export function PedidoCreditoPanel({
  credito, excepcionAplicada, excepcionNoAplica, vista, solicitando, error, total,
  onSolicitar, onReiniciar, onCobrarAhora,
}: PedidoCreditoPanelProps) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')

  if (!credito) return null
  if (!credito.bloqueado && !excepcionAplicada) return null

  // C — autorizada y vigente para esta operación
  if (excepcionAplicada && vista?.estado === 'AUTORIZADA') {
    return (
      <section data-testid="credito-panel" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
        <p data-testid="credito-estado-autorizada" className="font-medium">
          ✅ Excepción autorizada{vista.autorizadoPorNombre ? ` por ${vista.autorizadoPorNombre}` : ''}.
        </p>
        <p className="mt-0.5 text-xs">
          Vale solo para esta venta, hoy{vista.saldoAutorizado != null ? ` y hasta ${formatCurrency(vista.saldoAutorizado)} de saldo` : ''}.
          Se revisa de nuevo al crear.
        </p>
      </section>
    )
  }
  if (excepcionAplicada) return null

  const enviar = () => {
    if (motivo.trim().length === 0) return
    onSolicitar(motivo.trim(), nota.trim())
  }

  const tabla = (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" data-testid="credito-tabla">
      <dt className="text-gray-500">Límite</dt><dd className="text-right">{credito.limite} fiados</dd>
      <dt className="text-gray-500">Abiertos ahora</dt><dd className="text-right">{credito.abiertos} · {formatCurrency(credito.saldoAbierto)}</dd>
      <dt className="text-gray-500">Esta venta deja</dt><dd className="text-right">+1 · {formatCurrency(credito.saldoOperacion)}</dd>
      <dt className="text-gray-500">Quedaría</dt><dd className="text-right">{credito.abiertosDespues} de {credito.limite} · {formatCurrency(credito.saldoDespues)}</dd>
      {credito.abiertosDespues > credito.limite && (
        <><dt className="text-gray-500">Exceso</dt><dd className="text-right">{credito.abiertosDespues - credito.limite}</dd></>
      )}
    </dl>
  )

  const cobrarAhora = (
    <button
      type="button"
      data-testid="credito-cobrar-ahora"
      onClick={onCobrarAhora}
      className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      Cobrar ahora {formatCurrency(total)}
    </button>
  )

  // B — pendiente
  if (vista?.estado === 'PENDIENTE') {
    return (
      <section data-testid="credito-panel" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p data-testid="credito-estado-pendiente" role="status" className="font-medium">
          ⏳ Excepción pendiente. Avisamos a quien puede autorizar; puedes seguir con otros pedidos.
        </p>
        <p className="text-xs">Motivo: {vista.motivoSolicitud}</p>
        {tabla}
        <p className="text-xs">También puedes cobrar ahora y no hace falta excepción.</p>
        {cobrarAhora}
      </section>
    )
  }

  // rechazada
  const rechazada = vista?.estado === 'RECHAZADA'
  // autorizada pero que ya no cubre esta operación
  const noCubre = excepcionNoAplica && vista?.estado === 'AUTORIZADA'

  return (
    <section data-testid="credito-panel" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p className="font-medium">
        {credito.causa === 'CLIENTE_BLOQUEADO'
          ? '🔒 Este cliente está bloqueado por deuda vencida y esta venta deja saldo.'
          : '🔒 Este cliente llegó a su límite de fiados y esta venta deja saldo.'}
      </p>
      {rechazada && (
        <p data-testid="credito-estado-rechazada" className="rounded-lg bg-white/60 px-2 py-1 text-xs">
          La excepción fue rechazada{vista?.rechazadoPorNombre ? ` por ${vista.rechazadoPorNombre}` : ''}
          {vista?.notaRechazo ? `: ${vista.notaRechazo}` : '.'}
        </p>
      )}
      {noCubre && (
        <p data-testid="credito-no-cubre" className="rounded-lg bg-white/60 px-2 py-1 text-xs">
          {excepcionNoAplica?.motivo === 'VENCIDA'
            ? 'La excepción autorizada ya venció (vale solo el día en que se autoriza).'
            : `La excepción autorizada cubre hasta ${formatCurrency(excepcionNoAplica?.saldoAutorizado ?? 0)} de saldo y esta venta deja más.`}
          {' '}Pide una nueva.
        </p>
      )}
      {tabla}
      <p className="text-xs">Si paga completo, no hace falta excepción.</p>
      {cobrarAhora}

      {!abierto ? (
        <button
          type="button"
          data-testid="credito-pedir-excepcion"
          onClick={() => { if (rechazada || noCubre) onReiniciar(); setAbierto(true) }}
          className="w-full rounded-lg border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          Pedir excepción
        </button>
      ) : (
        <div className="space-y-2 rounded-lg bg-white/70 p-2" data-testid="credito-form">
          <label htmlFor="credito-motivo" className="block text-xs font-medium">Motivo (obligatorio)</label>
          <input
            id="credito-motivo"
            data-testid="credito-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={200}
            className="w-full rounded border px-2 py-1 text-sm text-gray-900"
            placeholder="Ej. paga el viernes"
          />
          <label htmlFor="credito-nota" className="block text-xs font-medium">Nota para quien autoriza (opcional)</label>
          <textarea
            id="credito-nota"
            data-testid="credito-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded border px-2 py-1 text-sm text-gray-900"
          />
          {error && <p role="alert" data-testid="credito-error" className="text-xs text-red-700">{error}</p>}
          <button
            type="button"
            data-testid="credito-enviar"
            disabled={solicitando || motivo.trim().length === 0}
            onClick={enviar}
            className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40"
          >
            {solicitando ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      )}
    </section>
  )
}
