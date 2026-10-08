'use client'

import { useState } from 'react'
import { METODOS_PAGO } from '@/lib/metodos-pago'
import { formatCurrency } from '@/lib/utils'
import type { DraftPago } from './types'

type Metodo = DraftPago['metodo']

export interface WorkspaceDineroProps {
  /** total calculado por el backend (preview); null mientras no hay cálculo. */
  total: number | null
  /** saldo que proyecta el backend con los pagos actuales. */
  saldoProyectado: number | null
  pagos: DraftPago[]
  /** método de "pagar completo" activo (el pago sigue al total), o null. */
  pagoCompleto: Metodo | null
  /** venta a CONSUMIDOR_FINAL: no puede quedar saldo (DEUDOR_REQUERIDO). */
  esAnonima: boolean
  disabled?: boolean
  onPagarCompleto: (metodo: Metodo) => void
  onSetPagos: (pagos: DraftPago[]) => void
}

/**
 * Zona Dinero del PedidosWorkspace (P0 — docs/pedidos/HUB_REVISION_INTEGRAL_v1.0.md).
 *
 * Distingue lo que el negocio necesita separar:
 *   total de la venta ≠ dinero recibido ≠ cambio ≠ dinero aplicado.
 * Solo el **aplicado** viaja al backend como `pagos[]` (es lo que se persiste
 * como `Pago`). El "recibido en efectivo" y el cambio son ayuda de caja para
 * el operador: no se envían ni se guardan como saldo a favor.
 *
 * No calcula precios ni decide si se puede confirmar: el total, el saldo y el
 * bloqueo (DEUDOR_REQUERIDO, límite de fiados) vienen del preview del backend.
 */
export function WorkspaceDinero({
  total, saldoProyectado, pagos, pagoCompleto, esAnonima, disabled, onPagarCompleto, onSetPagos,
}: WorkspaceDineroProps) {
  const [recibido, setRecibido] = useState('')

  const aplicado = pagos.reduce((s, p) => s + (p.monto || 0), 0)
  const efectivoAplicado = pagos.filter((p) => p.metodo === 'EFECTIVO').reduce((s, p) => s + (p.monto || 0), 0)
  const recibidoNum = Number(recibido) || 0
  const cambio = recibidoNum - efectivoAplicado
  const metodosUsados = new Set(pagos.map((p) => p.metodo))
  const saldo = saldoProyectado ?? (total != null ? Math.max(0, total - aplicado) : null)
  const restante = total != null ? Math.max(0, total - aplicado) : 0

  const setMonto = (idx: number, valor: string) => {
    const monto = Math.max(0, Number(valor) || 0)
    onSetPagos(pagos.map((p, i) => (i === idx ? { ...p, monto } : p)))
  }
  const quitar = (idx: number) => onSetPagos(pagos.filter((_, i) => i !== idx))
  const agregar = (metodo: Metodo) => onSetPagos([...pagos, { metodo, monto: restante }])

  return (
    <section data-testid="workspace-dinero" className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-700">💰 Cobro</h3>
        {total != null && (
          <span className="text-sm text-gray-500" data-testid="dinero-total">Total {formatCurrency(total)}</span>
        )}
      </div>

      {pagos.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">¿Cómo pagó?</p>
          <div className="flex flex-wrap gap-2">
            {METODOS_PAGO.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                data-testid={`dinero-pagar-completo-${m.id}`}
                onClick={() => onPagarCompleto(m.id as Metodo)}
                className={`flex items-center gap-1 rounded-full border px-3 py-2 text-sm transition disabled:opacity-50 ${
                  m.id === 'EFECTIVO' ? 'border-green-600 bg-green-50 font-medium text-green-800' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <span aria-hidden>{m.emoji}</span>
                {m.id === 'EFECTIVO' ? 'Pagado en efectivo' : m.nombre}
              </button>
            ))}
          </div>
          {!esAnonima && (
            <button
              type="button"
              disabled={disabled}
              data-testid="dinero-pago-parcial"
              onClick={() => onSetPagos([{ metodo: 'EFECTIVO', monto: 0 }])}
              className="text-xs text-blue-600 underline-offset-2 hover:underline"
            >
              Pago parcial o combinado
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {pagos.map((p, idx) => {
            const info = METODOS_PAGO.find((m) => m.id === p.metodo)
            return (
              <div key={`${p.metodo}-${idx}`} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <span className="w-28 shrink-0 text-sm text-gray-700">
                  <span aria-hidden>{info?.emoji}</span> {info?.nombre ?? p.metodo}
                </span>
                <label className="sr-only" htmlFor={`dinero-monto-${idx}`}>Monto {info?.nombre}</label>
                <input
                  id={`dinero-monto-${idx}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  disabled={disabled}
                  data-testid={`dinero-pago-monto-${idx}`}
                  value={p.monto || ''}
                  onChange={(e) => setMonto(idx, e.target.value)}
                  className="flex-1 rounded border px-2 py-1 text-right text-sm"
                />
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Quitar pago ${info?.nombre ?? p.metodo}`}
                  data-testid={`dinero-quitar-${idx}`}
                  onClick={() => quitar(idx)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            )
          })}
          {pagoCompleto && (
            <p className="text-[11px] text-gray-500" data-testid="dinero-sigue-total">
              Cobro completo: se ajusta solo si cambias productos o precios.
            </p>
          )}
          {restante > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-500">Agregar:</span>
              {METODOS_PAGO.filter((m) => !metodosUsados.has(m.id as Metodo)).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`dinero-agregar-${m.id}`}
                  onClick={() => agregar(m.id as Metodo)}
                  className="rounded-full border px-2 py-0.5 text-xs hover:bg-gray-50"
                >
                  {m.emoji} {m.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {efectivoAplicado > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="dinero-recibido" className="text-gray-600">Recibido en efectivo</label>
          <input
            id="dinero-recibido"
            type="number"
            inputMode="numeric"
            min={0}
            disabled={disabled}
            data-testid="dinero-recibido"
            value={recibido}
            onChange={(e) => setRecibido(e.target.value)}
            placeholder={String(efectivoAplicado)}
            className="w-28 rounded border px-2 py-1 text-right"
          />
          {recibidoNum > 0 && (
            cambio >= 0 ? (
              <span className="font-medium text-green-700" data-testid="dinero-cambio">Cambio {formatCurrency(cambio)}</span>
            ) : (
              <span className="text-amber-700" data-testid="dinero-falta-efectivo">Faltan {formatCurrency(-cambio)}</span>
            )
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-sm">
        <dt className="text-gray-500">Dinero aplicado</dt>
        <dd className="text-right font-medium" data-testid="dinero-aplicado">{formatCurrency(aplicado)}</dd>
        <dt className="text-gray-500">Saldo pendiente</dt>
        <dd
          className={`text-right font-semibold ${saldo && saldo > 0 ? 'text-red-600' : 'text-green-700'}`}
          data-testid="dinero-saldo"
        >
          {saldo == null ? '—' : saldo > 0 ? formatCurrency(saldo) : 'Pagado'}
        </dd>
      </dl>

      {esAnonima && saldo != null && saldo > 0 && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="dinero-deudor-requerido">
          Venta sin cliente: registra el pago completo. Si queda debiendo, toma la operación como pedido con el cliente identificado.
        </p>
      )}
    </section>
  )
}
