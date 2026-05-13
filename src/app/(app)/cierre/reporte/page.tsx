'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { CierreData } from '../cierre-client/types'

const ORIGEN_LABELS: Record<string, string> = {
  PEDIDO: 'Pedido',
  VENTA_RAPIDA: 'Venta Rápida',
  VENTA_LIBRE: 'Venta Libre',
}

const formatMoney = (val: number) => `$${val.toLocaleString()}`

export default function ReportePage() {
  const searchParams = useSearchParams()
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0]
  const [data, setData] = useState<CierreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/cierre?fecha=${fecha}`)
      .then(r => r.json())
      .then(json => {
        if (json.cierre) setData(json.cierre)
        else setError('No se encontraron datos')
      })
      .catch(() => setError('Error cargando datos'))
      .finally(() => setLoading(false))
  }, [fecha])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>
  if (!data) return <div className="p-8 text-center text-muted-foreground">Sin datos</div>

  const netoTeorico = (data.efectivo || 0) + (data.transferencia || 0) + (data.nequi || 0) + (data.daviplata || 0) + (data.bono || 0) - (data.totalGastos || 0)

  const prod = data.produccion

  return (
    <div className="max-w-4xl mx-auto p-8 print:p-4">
      <div className="no-print flex justify-end mb-4">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Imprimir / Guardar como PDF
        </button>
      </div>

      <div className="text-center border-b pb-4 mb-6">
        <h1 className="text-2xl font-bold">Agua Bambú SAS</h1>
        <h2 className="text-lg font-semibold mt-1">Cierre del Día — {fecha}</h2>
        <p className="text-sm text-muted-foreground">Generado el {new Date().toLocaleString('es-CO')}</p>
      </div>

      <section className="mb-6">
        <h3 className="text-lg font-bold border-b pb-1 mb-3">Resumen Financiero</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="py-1 font-medium">Pedidos</td><td className="text-right">{data.numPedidos}</td></tr>
            <tr><td className="py-1 font-medium">Ventas Totales</td><td className="text-right">{formatMoney(data.totalVentas)}</td></tr>
            <tr><td className="py-1 font-medium">Cobrado (ventas de hoy)</td><td className="text-right">{formatMoney(data.cobroVentasHoy)}</td></tr>
            <tr><td className="py-1 font-medium">Recaudo Cartera</td><td className="text-right">{formatMoney(data.cobroCartera)}</td></tr>
            <tr><td className="py-1 font-medium">Fiado</td><td className="text-right">{formatMoney(data.fiado)}</td></tr>
            <tr><td className="py-1 font-medium">Notas Crédito</td><td className="text-right">{formatMoney(data.totalNotasCredito)}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-bold border-b pb-1 mb-3">Cobros por Método</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="py-1">Efectivo</td><td className="text-right">{formatMoney(data.efectivo)}</td></tr>
            <tr><td className="py-1">Transferencia</td><td className="text-right">{formatMoney(data.transferencia)}</td></tr>
            <tr><td className="py-1">Nequi</td><td className="text-right">{formatMoney(data.nequi)}</td></tr>
            <tr><td className="py-1">Daviplata</td><td className="text-right">{formatMoney(data.daviplata)}</td></tr>
            <tr><td className="py-1">Bono</td><td className="text-right">{formatMoney(data.bono)}</td></tr>
          </tbody>
        </table>
      </section>

      {data.ventasPorOrigen && data.ventasPorOrigen.length > 0 && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b pb-1 mb-3">Ventas por Origen</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-1">Origen</th><th className="text-right py-1">Total</th><th className="text-right py-1">Cantidad</th></tr></thead>
            <tbody>
              {data.ventasPorOrigen.map(v => (
                <tr key={v.origen}><td className="py-1">{ORIGEN_LABELS[v.origen] || v.origen}</td><td className="text-right">{formatMoney(v.total)}</td><td className="text-right">{v.count}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.facturasEmitidas > 0 && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b pb-1 mb-3">Facturas del Día</h3>
          <p className="text-sm mb-2">Emitidas: {data.facturasEmitidas} | Pagadas: {data.facturasPagadasCount} ({formatMoney(data.facturasPagadasTotal)}) | Por Cobrar: {data.facturasPorCobrarCount} ({formatMoney(data.facturasPorCobrarTotal)}) | Anuladas: {data.facturasAnuladasCount}</p>
          {data.facturas && data.facturas.length > 0 && (
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-1">Nº</th><th className="text-left py-1">Cliente</th><th className="text-right py-1">Total</th><th className="text-right py-1">Saldo</th><th className="text-right py-1">Estado</th></tr></thead>
              <tbody>
                {data.facturas.map(f => (
                  <tr key={f.numero}><td className="py-1">{f.numero}</td><td className="py-1">{f.cliente || '—'}</td><td className="text-right">{formatMoney(f.total)}</td><td className="text-right">{formatMoney(f.saldo)}</td><td className="text-right">{f.estado}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {data.totalGastos > 0 && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b pb-1 mb-3">Gastos — Total: {formatMoney(data.totalGastos)}</h3>
          {data.gastosPorCategoria?.map(g => (
            <div key={g.categoria} className="flex justify-between py-1 text-sm"><span>{g.categoria} ({g.cantidad})</span><span>{formatMoney(g.total)}</span></div>
          ))}
        </section>
      )}

      {data.embarques && data.embarques.length > 0 && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b pb-1 mb-3">Embarques</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-1">Nº</th><th className="text-left py-1">Repartidor</th><th className="text-left py-1">Ruta</th><th className="text-right py-1">Agua</th><th className="text-right py-1">Hielo</th><th className="text-right py-1">Dev. Agua</th><th className="text-right py-1">Dev. Hielo</th><th className="text-right py-1">Estado</th></tr></thead>
            <tbody>
              {data.embarques.map((e, i) => (
                <tr key={e.numero + '-' + i}><td className="py-1">{e.numero}</td><td className="py-1">{e.repartidor || '—'}</td><td className="py-1">{e.ruta || '—'}</td><td className="text-right">{e.pacasAgua}</td><td className="text-right">{e.pacasHielo}</td><td className="text-right">{e.devueltasAgua}</td><td className="text-right">{e.devueltasHielo}</td><td className="text-right">{e.estado}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mb-6">
        <h3 className="text-lg font-bold border-b pb-1 mb-3">Stock</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="font-medium">Agua: {prod?.stockIniAgua || 0} + {prod?.prodAgua || 0} - {data.aguaVendida} = {prod?.stockFinAgua || 0}</p></div>
          <div><p className="font-medium">Hielo: {prod?.stockIniHielo || 0} + {prod?.prodHielo || 0} - {data.hieloVendido} = {prod?.stockFinHielo || 0}</p></div>
        </div>
      </section>

      {(data.pedidosCanceladosCount || data.pedidosNoEntregadosCount || data.pedidosAnuladosCount) && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b pb-1 mb-3">Pedidos Perdidos</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>Cancelados: {data.pedidosCanceladosCount} ({formatMoney(data.pedidosCanceladosTotal)})</div>
            <div>No Entregados: {data.pedidosNoEntregadosCount} ({formatMoney(data.pedidosNoEntregadosTotal)})</div>
            <div>Anulados: {data.pedidosAnuladosCount} ({formatMoney(data.pedidosAnuladosTotal)})</div>
          </div>
        </section>
      )}

      {data.clientesNuevos > 0 && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b pb-1 mb-3">Clientes Nuevos: {data.clientesNuevos}</h3>
        </section>
      )}

      {data.descuentosRepartidorCount > 0 && (
        <section className="mb-6">
          <h3 className="text-lg font-bold border-b pb-1 mb-3">Descuentos Repartidor — {formatMoney(data.descuentosRepartidorTotal)}</h3>
          {data.descuentos.map((d, i) => (
            <div key={i} className="flex justify-between py-1 text-sm"><span>{d.repartidor || '—'} ({d.motivo})</span><span>-{formatMoney(d.monto)}</span></div>
          ))}
        </section>
      )}

      <section className="mb-6">
        <h3 className="text-lg font-bold border-b pb-1 mb-3">Resumen de Caja</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="py-1 font-medium">Neto Teórico</td><td className="text-right font-bold">{formatMoney(netoTeorico)}</td></tr>
          </tbody>
        </table>
      </section>

      <div className="mt-16 pt-8 border-t">
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="border-t border-black pt-2 mt-16">Cerrado por</div>
          </div>
          <div className="text-center">
            <div className="border-t border-black pt-2 mt-16">Revisado por</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}
