'use client'

import { formatCurrency } from '@/lib/utils'
import { useSaldoFavorPedido, type MovimientoSaldoFavor } from './use-saldo-favor-pedido'

function queParo(m: MovimientoSaldoFavor): string {
  if (m.tipo === 'ACREDITACION') {
    return m.origenTipo === 'REDUCCION_COMERCIAL'
      ? 'Pasó al saldo a favor (reducción comercial)'
      : 'Pasó al saldo a favor (corrección de precio)'
  }
  if (m.tipo === 'REAPLICACION') return 'Volvió a este pedido porque su total subió'
  return m.origenTipo === 'CANCELACION' ? 'Se restó al cancelar el pedido' : 'Se restó al anular el pedido'
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

/**
 * Historial del saldo a favor de UN pedido (#577), para que nadie tenga que adivinar de dónde salió
 * ni a dónde fue ese dinero. No muestra nada si el pedido nunca movió saldo a favor.
 */
export function SaldoFavorHistorial({ pedidoId }: { pedidoId: string }) {
  const e = useSaldoFavorPedido(pedidoId)
  if (e.estado !== 'listo' || e.datos.movimientos.length === 0) return null
  const { movimientos, resultado } = e.datos
  const terminal = e.datos.pedido.estadoEntrega === 'ANULADO' || e.datos.pedido.estadoEntrega === 'CANCELADO'
  const verbo = e.datos.pedido.estadoEntrega === 'CANCELADO' ? 'cancelar' : 'anular'

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4" data-testid="saldo-favor-historial">
      {terminal && resultado && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="saldo-favor-resultado">
          <p className="font-semibold">Saldo a favor{resultado.revertido > 0 ? ' revertido' : ''}</p>
          <p className="mt-1">
            {resultado.revertido > 0 ? <>Al {verbo} se restaron <b>{formatCurrency(resultado.revertido)}</b>. </> : null}
            {resultado.yaUsado > 0
              ? <>Otros <b>{formatCurrency(resultado.yaUsado)}</b> ya se habían usado en otros pedidos y no se restaron.</>
              : <>No quedó saldo a favor de este pedido.</>}
          </p>
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Historial de saldo a favor de este pedido</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2 font-medium">Fecha</th>
              <th className="py-1 pr-2 font-medium">Qué pasó</th>
              <th className="py-1 pr-2 font-medium">Quién</th>
              <th className="py-1 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id} className="border-t border-gray-100 align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{fecha(m.fecha)}</td>
                <td className="py-1 pr-2">
                  {queParo(m)}
                  {m.tipo === 'REVERSION_ANULACION' && m.motivo ? <span className="text-gray-500"> · Motivo: {m.motivo}</span> : null}
                </td>
                <td className="py-1 pr-2">{m.autor || '—'}</td>
                <td className="py-1 text-right whitespace-nowrap tabular-nums">{m.tipo === 'ACREDITACION' ? '+' : '−'} {formatCurrency(m.monto)}</td>
              </tr>
            ))}
            {terminal && resultado && resultado.yaUsado > 0 && (
              <tr className="border-t border-gray-100 align-top" data-testid="saldo-favor-fila-ya-usado">
                <td className="py-1 pr-2" />
                <td className="py-1 pr-2">El cliente ya lo había usado en otros pedidos</td>
                <td className="py-1 pr-2">—</td>
                <td className="py-1 text-right whitespace-nowrap tabular-nums">{formatCurrency(resultado.yaUsado)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
