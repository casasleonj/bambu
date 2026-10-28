'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { CierreData } from '@/app/(app)/cierre/cierre-client/types'

const ORIGEN_LABELS: Record<string, string> = {
  PEDIDO: 'Pedido',
  VENTA_RAPIDA: 'Venta Rápida',
  VENTA_LIBRE: 'Venta Libre',
}

const formatMoney = formatCurrency

export default function CierreKpiGrid({ data, netoTeorico, baseDia, comisiones, salarios }: {
  data: CierreData | null; netoTeorico: number; baseDia?: number; comisiones?: number; salarios?: number;
}) {
  const [expanded, setExpanded] = useState(false)
  if (!data) return null
  const cards = [
    { key: 'ventas', label: 'Ventas de la fecha (netas)', amount: data.totalVentas, detail: 'Después del ajuste de ventas anteriores.' },
    { key: 'cobros', label: 'Cobros de la fecha', amount: data.cobroVentasHoy + data.cobroCartera, detail: 'Incluye cobros de pedidos de otros días.' },
    { key: 'gastos', label: 'Gastos de la fecha', amount: data.totalGastos, detail: 'Egresos registrados en el sistema.' },
    { key: 'neto', label: 'Neto de movimientos', amount: netoTeorico, detail: 'Incluye la base y los pagos digitales.' },
  ]
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(card => <div key={card.key} data-testid={`cierre-kpi-${card.key}`} className={`rounded-xl border p-4 min-w-0 ${card.key === 'cobros' ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-200'}`}>
          <div className="min-h-9 text-xs leading-relaxed text-slate-500">{card.label}</div>
          <div className={`text-xl lg:text-2xl font-bold tracking-tight tabular-nums whitespace-nowrap ${card.key === 'cobros' ? 'text-blue-700' : 'text-slate-800'}`}>{formatMoney(card.amount)}</div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{card.detail}</p>
        </div>)}
      </div>
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">Los pedidos anulados o cancelados de esta fecha ya están excluidos de las ventas. Un mismo cobro no se suma otra vez por aparecer también como abono.</p>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <details open className="rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Cómo se calculan las ventas</summary>
          {data.notasCreditoVentasAnteriores !== undefined ? <dl className="mt-3 divide-y divide-slate-100 text-xs">
            <FinancialRow label="Pedidos activos de la fecha" value={data.ventasDePedidosDelDia ?? 0} />
            <FinancialRow label="Ajuste de ventas de días anteriores" value={-data.notasCreditoVentasAnteriores} />
            <FinancialRow label="Ventas netas" value={data.totalVentas} total />
            <FinancialRow label="Notas de crédito emitidas" value={data.totalNotasCredito} />
            <FinancialRow label="Sin nueva resta de ventas: ya excluidos" value={data.notasCreditoSinAjusteVentas ?? 0} />
            <FinancialRow label="De días anteriores: ajuste incluido arriba" value={data.notasCreditoVentasAnteriores} />
          </dl> : <p className="mt-3 text-xs text-slate-500">El desglose de notas no está disponible para este cierre histórico. Se conserva el total registrado.</p>}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Una nota de crédito no significa, por sí sola, que se haya devuelto dinero en efectivo.</p>
        </details>
        <details open className="rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Cómo se calcula el neto</summary>
          <dl className="mt-3 divide-y divide-slate-100 text-xs">
            <FinancialRow label="Base del día" value={baseDia ?? data.baseDia ?? 0} />
            <FinancialRow label="Pagos registrados en la fecha" value={data.cobroVentasHoy} sign />
            {data.abonosIndependientes !== undefined ? <>
              <FinancialRow label="Abonos independientes" value={data.abonosIndependientes} sign />
              <FinancialRow label="Ajustes de cobros" value={-(data.ajustesDeCobros ?? 0)} />
            </> : <FinancialRow label="Abonos y ajustes de cobros" value={data.cobroCartera} sign />}
            <FinancialRow label="Gastos" value={-data.totalGastos} />
            <FinancialRow label="Comisiones pagadas" value={-(comisiones ?? data.comisiones ?? 0)} />
            {(salarios ?? data.salarios ?? 0) > 0 && <FinancialRow label="Salarios" value={-(salarios ?? data.salarios ?? 0)} />}
            <FinancialRow label="Neto de movimientos" value={netoTeorico} total />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Este neto incluye pagos digitales. No equivale al efectivo físico contado.</p>
        </details>
      </div>
      {/* Toggle detalles */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
      >
        {expanded ? '▲ Ocultar detalles' : '▼ Ver detalles del día'}
      </button>

      {/* Detalles expandibles */}
      {expanded && data && (
        <div className="mt-4 space-y-4 pt-4 border-t">
          <p className="text-sm">Pagado sobre pedidos de esta fecha: {formatMoney(data.cobrado)}. Puede incluir pagos registrados en otros días.</p>
          {/* Métodos de Pago */}
          {(data.efectivo || data.transferencia || data.nequi || data.daviplata || data.bono) > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Métodos de Pago</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <div><span className="text-muted-foreground">Efectivo </span><span className="font-medium">{formatMoney(data.efectivo || 0)}</span></div>
                <div><span className="text-muted-foreground">Transferencia </span><span className="font-medium">{formatMoney(data.transferencia || 0)}</span></div>
                <div><span className="text-muted-foreground">Nequi </span><span className="font-medium">{formatMoney(data.nequi || 0)}</span></div>
                <div><span className="text-muted-foreground">Daviplata </span><span className="font-medium">{formatMoney(data.daviplata || 0)}</span></div>
                <div><span className="text-muted-foreground">Bono </span><span className="font-medium">{formatMoney(data.bono || 0)}</span></div>
              </div>
            </div>
          )}

          {/* Ventas por Origen */}
          {data.ventasPorOrigen && data.ventasPorOrigen.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ventas por Origen</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {data.ventasPorOrigen.map(v => (
                  <div key={v.origen} className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">{ORIGEN_LABELS[v.origen] || v.origen}</div>
                    <div className="text-base font-bold">{formatMoney(v.total)}</div>
                    <div className="text-xs text-muted-foreground">{v.count} pedidos</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Facturas */}
          {data.facturasEmitidas > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Facturas</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <div><span className="text-muted-foreground">Emitidas </span><span className="font-medium">{data.facturasEmitidas}</span></div>
                <div><span className="text-muted-foreground">Pagadas </span><span className="font-medium text-green-600">{formatMoney(data.facturasPagadasTotal)}</span><span className="text-xs text-muted-foreground ml-1">({data.facturasPagadasCount})</span></div>
                <div><span className="text-muted-foreground">Parciales </span><span className="font-medium text-orange-600">{formatMoney(data.facturasParcialTotal || 0)}</span><span className="text-xs text-muted-foreground ml-1">({data.facturasParcialCount || 0})</span></div>
                <div><span className="text-muted-foreground">Por Cobrar </span><span className="font-medium text-yellow-600">{formatMoney(data.facturasPorCobrarTotal)}</span><span className="text-xs text-muted-foreground ml-1">({data.facturasPorCobrarCount})</span></div>
                <div><span className="text-muted-foreground">Anuladas </span><span className="font-medium text-red-600">{data.facturasAnuladasCount}</span></div>
              </div>
            </div>
          )}

          {/* Embarques */}
          {data.embarques && data.embarques.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Embarques ({data.embarques.length})</h4>
              <div className="overflow-x-auto text-sm border rounded-lg">
                <table className="w-full">
                  <thead><tr className="border-b bg-muted/50"><th className="text-left px-3 py-1.5">Nº</th><th className="text-left py-1.5">Repartidor</th><th className="text-left py-1.5">Ruta</th><th className="text-right py-1.5">Agua</th><th className="text-right py-1.5">Hielo</th><th className="text-right py-1.5 pr-3">Estado</th></tr></thead>
                  <tbody>
                    {data.embarques.map((e, i) => (
                      <tr key={e.numero + '-' + i} className="border-b last:border-0">
                        <td className="px-3 py-1">{e.numero}</td>
                        <td className="py-1">{e.repartidor || '—'}</td>
                        <td className="py-1">{e.ruta || '—'}</td>
                        <td className="text-right py-1">{e.pacasAgua}</td>
                        <td className="text-right py-1">{e.pacasHielo}</td>
                        <td className="text-right py-1 pr-3"><span className={`px-1.5 py-0.5 rounded-full text-xs ${e.estado === 'CERRADO' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{e.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pedidos Perdidos */}
          {(data.pedidosCanceladosCount || data.pedidosNoEntregadosCount || data.pedidosAnuladosCount) && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pedidos Perdidos</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="border rounded-lg p-2">
                  <div className="text-xs text-muted-foreground">Cancelados</div>
                  <div className="text-sm font-bold text-red-600">{data.pedidosCanceladosCount || 0} ({formatMoney(data.pedidosCanceladosTotal || 0)})</div>
                </div>
                <div className="border rounded-lg p-2">
                  <div className="text-xs text-muted-foreground">No Entregados</div>
                  <div className="text-sm font-bold text-orange-600">{data.pedidosNoEntregadosCount || 0} ({formatMoney(data.pedidosNoEntregadosTotal || 0)})</div>
                </div>
                <div className="border rounded-lg p-2">
                  <div className="text-xs text-muted-foreground">Anulados</div>
                  <div className="text-sm font-bold text-red-600">{data.pedidosAnuladosCount || 0} ({formatMoney(data.pedidosAnuladosTotal || 0)})</div>
                </div>
              </div>
            </div>
          )}

          {/* Gastos por Categoría */}
          {data.totalGastos > 0 && data.gastosPorCategoria && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Gastos por Categoría</h4>
              <div className="space-y-1 text-sm">
                {data.gastosPorCategoria.map(g => (
                  <div key={g.categoria} className="flex justify-between py-0.5">
                    <span>{g.categoria} <span className="text-muted-foreground">({g.cantidad})</span></span>
                    <span className="font-medium">{formatMoney(g.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clientes Nuevos */}
          {data.clientesNuevos > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">Clientes nuevos hoy: </span>
              <span className="font-bold text-green-600">{data.clientesNuevos}</span>
            </div>
          )}

          {/* Descuentos */}
          {data.descuentosRepartidorCount > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Descuentos a Repartidores — {formatMoney(data.descuentosRepartidorTotal)}</h4>
              <div className="space-y-1 text-sm">
                {(data.descuentos ?? []).map((d, i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span>{d.repartidor || '—'} <span className="text-muted-foreground">({d.motivo})</span></span>
                    <span className="font-medium text-red-600">-{formatMoney(d.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FinancialRow({ label, value, total = false, sign = false }: { label: string; value: number; total?: boolean; sign?: boolean }) {
  return <div className={`flex justify-between gap-4 py-2.5 ${total ? 'font-bold text-blue-900' : ''}`}>
    <dt className={total ? '' : 'text-slate-500'}>{label}</dt><dd className="whitespace-nowrap font-semibold tabular-nums">{sign && value > 0 ? '+ ' : ''}{formatMoney(value)}</dd>
  </div>
}
