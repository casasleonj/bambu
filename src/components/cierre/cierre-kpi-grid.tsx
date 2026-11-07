'use client'

// #646 — Tres cifras que importan (ventas, cobrado, fiado) y el detalle de las ventas en desplegables cerrados.
// «Neto de movimientos» y la tarjeta de gastos salen de la pantalla: el efectivo y los gastos ya están en
// «¿Cuánto efectivo debe haber en la caja?» y en su desplegable; el neto sigue guardado y en el reporte impreso.

import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { Desplegable } from '@/components/ui/desplegable'
import { formatCurrency } from '@/lib/utils'
import type { CierreData } from '@/app/(app)/cierre/cierre-client/types'

const ORIGEN_LABELS: Record<string, string> = {
  PEDIDO: 'Pedido',
  VENTA_RAPIDA: 'Venta en el punto',
  VENTA_LIBRE: 'Venta libre',
}

const formatMoney = formatCurrency

export function CierreKpiGrid({ data }: { data: CierreData | null }) {
  if (!data) return null
  const d = data.desgloseCobros
  const cobrado = data.cobroVentasHoy + data.cobroCartera
  const pctEfectivo = d && d.total > 0 ? Math.round((d.efectivo / d.total) * 100) : null
  const fiados = data.fiadosDelDia
  const totalFiado = fiados ? fiados.reduce((t, f) => t + f.saldo, 0) : data.fiado
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3" data-testid="cierre-kpis">
      <div data-testid="cierre-kpi-ventas" className="rounded-xl border border-violet-200 bg-violet-50 p-3 min-w-0">
        <div className="flex items-center text-xs font-semibold text-slate-600">
          Ventas del día
          <AyudaTermino texto={data.valorComercialPedidosDelDia === undefined ? 'Importe conservado por el cierre histórico con la definición que tenía al guardarse. No se recalcula con las reglas nuevas.' : 'Valor de lo entregado en los pedidos de esta fecha, sin anulados y menos devoluciones de ventas anteriores. Lo que falta entregar no se suma como entregado. Se agrupa por fecha del pedido; las unidades, por fecha de entrega. El cumplimiento se consulta en su estado actual.'} />
        </div>
        <div className="text-2xl font-extrabold tabular-nums text-violet-800">{formatMoney(data.totalVentas)}</div>
        <p className="text-[11px] text-slate-500">{data.valorComercialPedidosDelDia === undefined ? 'Pedidos de esta fecha, sin anulados.' : 'Lo entregado de los pedidos de esta fecha.'}</p>
      </div>
      <div data-testid="cierre-kpi-cobros" className="rounded-xl border border-blue-200 bg-blue-50 p-3 min-w-0">
        <div className="flex items-center text-xs font-semibold text-slate-600">
          Cobrado hoy
          <AyudaTermino texto="Todo lo que entró hoy (efectivo y digital), por pedidos de hoy o de días anteriores. Un mismo cobro no se suma dos veces." />
        </div>
        <div className="text-2xl font-extrabold tabular-nums text-blue-800">{formatMoney(cobrado)}</div>
        {pctEfectivo !== null ? (
          <>
            <div className="my-1.5 flex h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${pctEfectivo}% efectivo y ${100 - pctEfectivo}% digital`}>
              <i className="block bg-green-600" style={{ width: `${pctEfectivo}%` }} />
              <i className="block bg-blue-600" style={{ width: `${100 - pctEfectivo}%` }} />
            </div>
            <p className="text-[11px] text-slate-500">{pctEfectivo}% efectivo · {100 - pctEfectivo}% digital</p>
          </>
        ) : (
          <p className="text-[11px] text-slate-500">Incluye cobros de pedidos de otros días.</p>
        )}
      </div>
      <div data-testid="cierre-kpi-fiado" className="rounded-xl border border-amber-300 bg-amber-50 p-3 min-w-0">
        <div className="flex items-center text-xs font-semibold text-slate-600">
          Quedó fiado
          <AyudaTermino texto={data.valorComercialPedidosDelDia === undefined ? 'Saldo conservado por este cierre histórico; puede incluir mercancía pendiente según su definición original.' : 'Saldo actual por cobrar de la mercancía entregada en pedidos de esta fecha. Incluye entregas parciales, sin cobrar lo que falta entregar. Un pago posterior se registra en la caja de su fecha de recepción.'} />
        </div>
        <div className="text-2xl font-extrabold tabular-nums text-amber-800">{formatMoney(totalFiado)}</div>
        {(data.parcialesPorConciliar?.length ?? 0) > 0 && <p role="status" className="mt-1 text-xs font-semibold text-amber-900">Subtotal identificado. Hay {data.parcialesPorConciliar!.length} entregas por conciliar; no se supone deuda cero.</p>}
        <p className="text-[11px] text-slate-500">{fiados ? `${fiados.length} pedido${fiados.length === 1 ? '' : 's'} de hoy con saldo.` : 'Saldo de los pedidos de esta fecha.'}</p>
      </div>
    </div>
  )
}

export function CierreDetalleVentas({ data }: { data: CierreData | null }) {
  if (!data) return null
  const hayExtras = (data.ventasPorOrigen?.length ?? 0) > 0 || data.facturasEmitidas > 0 || (data.embarques?.length ?? 0) > 0
    || !!(data.pedidosCanceladosCount || data.pedidosNoEntregadosCount || data.pedidosAnuladosCount)
    || data.clientesNuevos > 0 || data.descuentosRepartidorCount > 0
  return (
    <div className="mt-2 space-y-2" data-testid="cierre-detalle-ventas">
      {data.notasCreditoVentasAnteriores !== undefined ? (
        <Desplegable testid="cierre-ventas-calculo" tono="violeta" icono="📊" titulo="De dónde salen las ventas del día"
          ayuda={data.valorComercialPedidosDelDia === undefined ? 'Importe guardado por el cierre histórico: pedidos de esta fecha menos devoluciones de ventas anteriores. Se conserva su definición original.' : 'Ventas = valor de lo entregado de los pedidos de esta fecha menos las devoluciones de ventas anteriores. El valor comercial original y lo que falta entregar se explican aparte.'}
          resumen={formatMoney(data.totalVentas)}>
          <dl className="divide-y divide-slate-100">
            {data.valorComercialPedidosDelDia !== undefined && <Linea label="Valor comercial de los pedidos" value={data.valorComercialPedidosDelDia} />}
            <Linea label={data.valorComercialPedidosDelDia === undefined ? 'Pedidos de esta fecha (sin anulados)' : 'Ya entregado de esos pedidos'} value={data.ventasDePedidosDelDia ?? 0} />
            {data.valorComercialPedidosDelDia !== undefined && data.valorComercialPedidosDelDia > (data.ventasDePedidosDelDia ?? 0) && <Linea label="Pendiente de entrega (no suma como venta entregada)" value={data.valorComercialPedidosDelDia - (data.ventasDePedidosDelDia ?? 0)} />}
            <Linea label="− Devoluciones de ventas de días anteriores" value={-data.notasCreditoVentasAnteriores} ayuda="Notas de crédito de pedidos de otros días: restan a las ventas de hoy." />
            <Linea label="Ventas del día" value={data.totalVentas} total />
            <Linea label="Notas de crédito emitidas hoy" value={data.totalNotasCredito} ayuda="Una nota de crédito corrige o devuelve una venta. No significa, por sí sola, que se haya devuelto dinero en efectivo." />
            {(data.notasCreditoSinAjusteVentas ?? 0) > 0 && <Linea label="De ellas, ya descontadas de las ventas" value={data.notasCreditoSinAjusteVentas ?? 0} />}
          </dl>
        </Desplegable>
      ) : (
        <p className="text-xs text-slate-500">El detalle de notas de crédito no está disponible para este cierre histórico. Se conserva el total registrado.</p>
      )}

      {hayExtras && (
        <Desplegable testid="cierre-mas-detalle" tono="gris" icono="🏷️" titulo="Más detalle del día" resumen={data.facturasEmitidas > 0 ? `${data.facturasEmitidas} facturas` : undefined}>
          <div className="space-y-4">
            <p className="text-sm">Pagado de los pedidos de hoy: <b>{formatMoney(data.cobrado)}</b>. <span className="text-slate-500">Parte pudo cobrarse en otro día.</span></p>

            {(data.ventasPorOrigen?.length ?? 0) > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ventas por tipo de venta</h4>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {data.ventasPorOrigen.map(v => (
                    <div key={v.origen} className="rounded-lg border p-2.5">
                      <div className="text-xs text-slate-500">{ORIGEN_LABELS[v.origen] || v.origen}</div>
                      <div className="text-base font-bold">{formatMoney(v.total)}</div>
                      <div className="text-xs text-slate-500">{v.count} pedidos</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.facturasEmitidas > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Facturas del día</h4>
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                  <div><span className="text-slate-500">Creadas </span><b>{data.facturasEmitidas}</b></div>
                  <div><span className="text-slate-500">Pagadas </span><b className="text-green-600">{formatMoney(data.facturasPagadasTotal)}</b><span className="ml-1 text-xs text-slate-500">({data.facturasPagadasCount})</span></div>
                  <div><span className="text-slate-500">Pagadas en parte </span><b className="text-orange-600">{formatMoney(data.facturasParcialTotal || 0)}</b><span className="ml-1 text-xs text-slate-500">({data.facturasParcialCount || 0})</span></div>
                  <div><span className="text-slate-500">Sin pagar </span><b className="text-yellow-600">{formatMoney(data.facturasPorCobrarTotal)}</b><span className="ml-1 text-xs text-slate-500">({data.facturasPorCobrarCount})</span></div>
                  <div><span className="text-slate-500">Anuladas </span><b className="text-red-600">{data.facturasAnuladasCount}</b></div>
                </div>
              </div>
            )}

            {data.embarques && data.embarques.length > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Embarques ({data.embarques.length})</h4>
                <div className="overflow-x-auto rounded-lg border text-sm">
                  <table className="w-full">
                    <thead><tr className="border-b bg-slate-50"><th className="px-3 py-1.5 text-left">Nº</th><th className="py-1.5 text-left">Repartidor</th><th className="py-1.5 text-left">Ruta</th><th className="py-1.5 text-right">Agua</th><th className="py-1.5 text-right">Hielo</th><th className="py-1.5 pr-3 text-right">Estado</th></tr></thead>
                    <tbody>
                      {data.embarques.map((e, i) => (
                        <tr key={e.numero + '-' + i} className="border-b last:border-0">
                          <td className="px-3 py-1">{e.numero}</td>
                          <td className="py-1">{e.repartidor || '—'}</td>
                          <td className="py-1">{e.ruta || '—'}</td>
                          <td className="py-1 text-right">{e.pacasAgua}</td>
                          <td className="py-1 text-right">{e.pacasHielo}</td>
                          <td className="py-1 pr-3 text-right"><span className={`rounded-full px-1.5 py-0.5 text-xs ${e.estado === 'CERRADO' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{e.estado}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(data.pedidosCanceladosCount || data.pedidosNoEntregadosCount || data.pedidosAnuladosCount) && (
              <div>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pedidos que no se vendieron</h4>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="rounded-lg border p-2"><div className="text-xs text-slate-500">Cancelados</div><div className="text-sm font-bold text-red-600">{data.pedidosCanceladosCount || 0} ({formatMoney(data.pedidosCanceladosTotal || 0)})</div></div>
                  <div className="rounded-lg border p-2"><div className="text-xs text-slate-500">No entregados</div><div className="text-sm font-bold text-orange-600">{data.pedidosNoEntregadosCount || 0} ({formatMoney(data.pedidosNoEntregadosTotal || 0)})</div></div>
                  <div className="rounded-lg border p-2"><div className="text-xs text-slate-500">Anulados</div><div className="text-sm font-bold text-red-600">{data.pedidosAnuladosCount || 0} ({formatMoney(data.pedidosAnuladosTotal || 0)})</div></div>
                </div>
              </div>
            )}

            {data.clientesNuevos > 0 && (
              <div className="text-sm"><span className="text-slate-500">Clientes nuevos hoy: </span><b className="text-green-600">{data.clientesNuevos}</b></div>
            )}

            {data.descuentosRepartidorCount > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Descuentos a repartidores — {formatMoney(data.descuentosRepartidorTotal)}</h4>
                <div className="space-y-1 text-sm">
                  {(data.descuentos ?? []).map((d, i) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{d.repartidor || '—'} <span className="text-slate-500">({d.motivo})</span></span>
                      <span className="font-medium text-red-600">-{formatMoney(d.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Desplegable>
      )}
    </div>
  )
}

function Linea({ label, value, total = false, ayuda }: { label: string; value: number; total?: boolean; ayuda?: string }) {
  return (
    <div className={`flex justify-between gap-4 py-2 ${total ? 'font-bold text-blue-900' : ''}`}>
      <dt className={total ? '' : 'text-slate-600'}>{label}{ayuda && <AyudaTermino texto={ayuda} />}</dt>
      <dd className="whitespace-nowrap font-semibold tabular-nums">{formatMoney(value)}</dd>
    </div>
  )
}

export default CierreKpiGrid
