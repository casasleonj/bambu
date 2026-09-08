'use client'

import type { ProyectarGestionPendienteResult } from '@/modules/embarques/application/use-cases/ProyectarGestionPendienteUseCase'

const money = (n: number) => `$${new Intl.NumberFormat('es-CO').format(Math.round(Number(n) || 0))}`

const TIPO_TITULO: Record<string, string> = {
  cobro_adicional: 'Cobro adicional',
  ajuste_a_favor: 'Ajuste a favor del cliente',
  sin_ajuste: 'Sin ajuste económico',
  reversion_parcial: 'Reversión parcial',
  reversion_total: 'Reversión',
}

/**
 * Impacto económico proyectado de una acción N2 (plan Fase 5, P2/P3).
 * Lenguaje explícito: qué sube/baja, qué pasa con `Cliente.saldoFavor`, y —
 * cuando aplica — qué **permanece** (el crédito ya acreditado es un efecto
 * económico real; esta acción no lo revierte). NO aparenta una reversión
 * completa cuando no existe. NO sugiere que el cliente "queda debiendo".
 * Política de dominio: docs/pedidos/POLITICA_SALDO_FAVOR_Y_DIFERENCIAL_NEGATIVO_v1.0.md
 */
export function N2Impacto({ proyeccion }: { proyeccion: ProyectarGestionPendienteResult }) {
  const c = proyeccion.consecuencia
  const esReversion = proyeccion.accion === 'liberar' || c.tipo === 'reversion_parcial' || c.tipo === 'reversion_total'

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px]" data-testid="n2-impacto">
      <div className="text-xs font-semibold text-blue-900" data-testid={`n2-impacto-tipo-${c.tipo}`}>
        {TIPO_TITULO[c.tipo] ?? c.tipo}
      </div>

      {/* Gestionar / cambiar modo: el diferencial */}
      {proyeccion.diferencial && !esReversion && (
        <p className="mt-1 text-blue-800">
          {c.tipo === 'cobro_adicional' && <>Se suma <b>{money(proyeccion.diferencial.diferencial)}</b> al pedido. Se cobra por cartera.</>}
          {c.tipo === 'ajuste_a_favor' && <>Se acredita <b>{money(Math.abs(proyeccion.diferencial.diferencial))}</b> al saldo a favor del cliente. El total del pedido <b>no baja</b>.</>}
          {c.tipo === 'sin_ajuste' && <>El modo coincide con el del pedido — sin diferencia de precio.</>}
        </p>
      )}

      {/* Liberar / cambiar modo: la reversión */}
      {proyeccion.reversion && (
        <div className="mt-1 space-y-0.5 text-blue-800" data-testid="n2-impacto-reversion">
          <p>Se revierten <b>{money(proyeccion.reversion.montoRevertible)}</b> del total del pedido.</p>
          {proyeccion.reversion.saldoFavorNoRevertido > 0 && (
            <p className="text-amber-800" data-testid="n2-impacto-no-revertido">
              Los <b>{money(proyeccion.reversion.saldoFavorNoRevertido)}</b> ya acreditados al saldo a favor del cliente <b>permanecen</b>: son un crédito real del cliente y esta acción no los revierte. El cliente no queda debiendo por esto.
            </p>
          )}
        </div>
      )}

      {/* Consecuencia final — inequívoca */}
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-blue-200 pt-1 text-blue-900">
        <dt>Total del pedido</dt>
        <dd className="text-right">{money(c.pedidoTotalAntes)} → <b>{money(c.pedidoTotalDespues)}</b></dd>
        <dt>Saldo del pedido</dt>
        <dd className="text-right">{money(c.pedidoSaldoAntes)} → <b>{money(c.pedidoSaldoDespues)}</b></dd>
        {c.clienteSaldoFavorDespues !== c.clienteSaldoFavorAntes && (
          <>
            <dt>Saldo a favor del cliente</dt>
            <dd className="text-right">{money(c.clienteSaldoFavorAntes)} → <b>{money(c.clienteSaldoFavorDespues)}</b></dd>
          </>
        )}
      </dl>

      {proyeccion.warnings.length > 0 && (
        <ul className="mt-1 ml-3 list-disc text-amber-800" data-testid="n2-impacto-warnings">
          {proyeccion.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
        </ul>
      )}
    </div>
  )
}
