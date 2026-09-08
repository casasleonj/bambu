'use client'

import type { ProyectarAjusteCantidadResult } from '@/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase'

const money = (n: number) => `$${new Intl.NumberFormat('es-CO').format(Math.round(Number(n) || 0))}`

const GUARD_TITULO: Record<string, string> = {
  CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA: 'No se puede corregir lo ya entregado',
  CORRECCION_PEDIDO_CERRADO: 'El pedido ya está cerrado',
  CORRECCION_GENERARIA_SOBREPAGO: 'La corrección dejaría saldo a favor',
}

/**
 * Impacto proyectado de una corrección de cantidad (plan Fase 6-i). Muestra
 * cantidad/subtotal/total antes→después, sobrepago, warnings y — si un guard
 * del backend bloquea — su título. La data viene completa de la proyección;
 * acá se decide qué mostrar (divulgación progresiva). NO recalcula nada.
 */
export function AjusteImpacto({ proyeccion }: { proyeccion: ProyectarAjusteCantidadResult }) {
  const p = proyeccion
  const bloqueado = p.bloqueadoPor !== null

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-[11px] ${bloqueado ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}
      data-testid="ajuste-impacto"
    >
      {bloqueado ? (
        <div className="text-xs font-semibold text-amber-900" data-testid={`ajuste-guard-${p.bloqueadoPor}`}>
          {GUARD_TITULO[p.bloqueadoPor!] ?? p.bloqueadoPor}
        </div>
      ) : (
        <div className="text-xs font-semibold text-blue-900">
          {p.delta > 0 ? 'Se agregan' : 'Se quitan'} {Math.abs(p.delta)} {p.producto.replace(/_/g, ' ').toLowerCase()}
        </div>
      )}

      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-800">
        <dt>Cantidad</dt>
        <dd className="text-right">{p.cantidadOriginal} → <b>{p.cantidadNueva}</b>{p.cantidadEntregada > 0 && <span className="text-gray-500"> (entregado {p.cantidadEntregada})</span>}</dd>
        <dt>Precio unitario</dt>
        <dd className="text-right">{money(p.precioHistorico)} <span className="text-gray-400">(no cambia)</span></dd>
        <dt>Subtotal del producto</dt>
        <dd className="text-right">{money(p.subtotalAntes)} → <b>{money(p.subtotalDespues)}</b></dd>
        <dt>Total del pedido</dt>
        <dd className="text-right">{money(p.totalAntes)} → <b>{money(p.totalDespues)}</b></dd>
        <dt>Pagado</dt>
        <dd className="text-right">{money(p.totalPagado)}</dd>
        <dt>Saldo del pedido</dt>
        <dd className="text-right">{money(p.saldoAntes)} → <b>{money(p.saldoDespues)}</b></dd>
        {p.estadoPagoDespues !== p.estadoPagoAntes && (
          <>
            <dt>Estado de pago</dt>
            <dd className="text-right">{p.estadoPagoAntes} → <b>{p.estadoPagoDespues}</b></dd>
          </>
        )}
      </dl>

      {p.sobrepagoProyectado > 0 && (
        <p className="mt-1 text-amber-800" data-testid="ajuste-impacto-sobrepago">
          El cliente ya pagó <b>{money(p.totalPagado)}</b>. Bajar a esta cantidad dejaría <b>{money(p.sobrepagoProyectado)}</b> a favor — primero hay que registrar esa devolución/crédito en Cartera.
        </p>
      )}

      {p.warnings.length > 0 && (
        <ul className="mt-1 ml-3 list-disc text-gray-600" data-testid="ajuste-impacto-warnings">
          {p.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
        </ul>
      )}
    </div>
  )
}
