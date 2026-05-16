'use client'

import { useState } from 'react'
import { DollarSign, CreditCard, TrendingDown, Calculator } from 'lucide-react'
import type { CierreData } from '@/app/(app)/cierre/cierre-client/types'

const ORIGEN_LABELS: Record<string, string> = {
  PEDIDO: 'Pedido',
  VENTA_RAPIDA: 'Venta Rápida',
  VENTA_LIBRE: 'Venta Libre',
}

const formatMoney = (val: number) => `$${val.toLocaleString()}`

export default function CierreKpiGrid({ data, netoTeorico }: { data: CierreData | null; netoTeorico: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      {/* 4 KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-4">
          <DollarSign className="w-6 h-6 text-emerald-600 mb-1" />
          <div className="text-xs text-emerald-700 font-medium">Total Ventas</div>
          <div className="text-xl font-bold text-emerald-900">{formatMoney(data?.totalVentas || 0)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-4">
          <CreditCard className="w-6 h-6 text-blue-600 mb-1" />
          <div className="text-xs text-blue-700 font-medium">Total Cobrado</div>
          <div className="text-xl font-bold text-blue-900">{formatMoney(data?.cobrado || 0)}</div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-xl p-4">
          <TrendingDown className="w-6 h-6 text-red-600 mb-1" />
          <div className="text-xs text-red-700 font-medium">Total Gastos</div>
          <div className="text-xl font-bold text-red-900">{formatMoney(data?.totalGastos || 0)}</div>
        </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-4">
            <Calculator className="w-6 h-6 text-purple-600 mb-1" />
            <div className="text-xs text-purple-700 font-medium">Neto Caja</div>
            <div className="text-xl font-bold text-purple-900">{formatMoney(netoTeorico)}</div>
          </div>
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
