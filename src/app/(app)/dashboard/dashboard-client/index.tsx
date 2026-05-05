'use client'

import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import type { DashboardData } from './types'

export function DashboardClient({ data }: { data: DashboardData }) {
  const {
    pedidos,
    ventas,
    fiadosTotal,
    clientesConFiado,
    pedidosPendientes,
    pedidosEntregados,
    baseDia,
    totalGastos,
    ventasTrend,
    pedidosTrend,
    hourlyPedidos,
    maxHourly,
    ventasPorPrecio,
    stockAgua,
    stockHielo,
    stockBotellon,
    embarquesAbiertos,
    stockAlertas,
    fechaHoy,
  } = data

  const fiadosHoy = data.fiadosHoy

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 capitalize">{fechaHoy}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pedidos del Dia</p>
              <p className="text-3xl font-bold text-gray-800">{pedidos.length}</p>
              <p className="text-xs text-gray-400 mt-1">
                {pedidosPendientes} pendientes &bull; {pedidosEntregados} entregados
              </p>
              {pedidosTrend !== 0 && (
                <p className={`text-xs mt-1 font-medium ${pedidosTrend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {pedidosTrend > 0 ? '↑' : '↓'} {Math.abs(pedidosTrend).toFixed(0)}% vs ayer
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Ventas del Dia</p>
              <p className="text-3xl font-bold text-green-600">{formatCurrency(ventas)}</p>
              <p className="text-xs text-gray-400 mt-1">Total vendido</p>
              {ventasTrend !== 0 && (
                <p className={`text-xs mt-1 font-medium ${ventasTrend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {ventasTrend > 0 ? '↑' : '↓'} {Math.abs(ventasTrend).toFixed(0)}% vs ayer
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Cuentas por Cobrar</p>
              <p className="text-3xl font-bold text-red-600">{formatCurrency(fiadosTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">{String(clientesConFiado)} clientes deben</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Embarques Activos</p>
              <p className="text-3xl font-bold text-orange-600">{embarquesAbiertos}</p>
              <p className="text-xs text-gray-400 mt-1">En curso</p>
            </div>
          </div>
        </div>
      </div>

      {(pedidosPendientes > 5 || fiadosTotal > 500000 || stockAlertas.length > 0 || embarquesAbiertos > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {pedidosPendientes > 5 && (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-yellow-600 text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-medium text-yellow-800">Pedidos pendientes</p>
                  <p className="text-xs text-yellow-600">{pedidosPendientes} pedidos sin embarcar</p>
                </div>
              </div>
              <Link href="/embarques" className="text-xs text-yellow-700 hover:underline mt-2 inline-block">Ir a embarques →</Link>
            </div>
          )}
          {fiadosTotal > 500000 && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-red-600 text-lg">💰</span>
                <div>
                  <p className="text-sm font-medium text-red-800">Fiados acumulados</p>
                  <p className="text-xs text-red-600">{formatCurrency(fiadosTotal)} por cobrar ({String(clientesConFiado)} clientes)</p>
                </div>
              </div>
              <Link href="/clientes" className="text-xs text-red-700 hover:underline mt-2 inline-block">Ver clientes →</Link>
            </div>
          )}
          {stockAlertas.map((insumo) => (
            <div key={insumo.id} className="bg-orange-50 border border-orange-200 p-4 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-orange-600 text-lg">📦</span>
                <div>
                  <p className="text-sm font-medium text-orange-800">Stock bajo</p>
                  <p className="text-xs text-orange-600">{insumo.nombre}: {Number(insumo.stock)} {insumo.unidad}</p>
                </div>
              </div>
              <Link href="/insumos" className="text-xs text-orange-700 hover:underline mt-2 inline-block">Reponer →</Link>
            </div>
          ))}
          {embarquesAbiertos > 0 && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 text-lg">🚚</span>
                <div>
                  <p className="text-sm font-medium text-blue-800">Embarques activos</p>
                  <p className="text-xs text-blue-600">{embarquesAbiertos} en curso</p>
                </div>
              </div>
              <Link href="/embarques" className="text-xs text-blue-700 hover:underline mt-2 inline-block">Seguimiento →</Link>
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Ventas por Precio</h2>
        {ventasPorPrecio.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p>No hay ventas registradas hoy</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Producto</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Precio</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Cantidad</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventasPorPrecio.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><span className="font-medium text-gray-800">{item.producto}</span></td>
                    <td className="px-4 py-3 text-center"><span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">{formatCurrency(item.precio)}</span></td>
                    <td className="px-4 py-3 text-center"><span className="text-2xl font-bold text-gray-800">{item.cantidad}</span><span className="text-sm text-gray-400 ml-1">und</span></td>
                    <td className="px-4 py-3 text-right"><span className="font-semibold text-green-600">{formatCurrency(item.subtotal)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr><td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-800">TOTAL:</td><td className="px-4 py-3 text-right font-bold text-green-600 text-lg">{formatCurrency(ventas)}</td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {ventasPorPrecio.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {['Paca Agua', 'Paca Hielo', 'Botellon Fab', 'Botellon Dom', 'Bolsa Agua', 'Bolsa Hielo'].map((producto) => {
            const items = ventasPorPrecio.filter(v => v.producto === producto)
            const totalCantidad = items.reduce((acc, v) => acc + v.cantidad, 0)
            const totalSubtotal = items.reduce((acc, v) => acc + v.subtotal, 0)
            if (totalCantidad === 0) return null
            return (
              <div key={producto} className="bg-white p-4 rounded-xl shadow-sm">
                <p className="text-sm text-gray-500">{producto}</p>
                <p className="text-2xl font-bold text-blue-600">{totalCantidad}</p>
                <p className="text-sm text-gray-400">{formatCurrency(totalSubtotal)}</p>
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Pedidos por Hora</h2>
        {pedidos.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p>No hay pedidos registrados hoy</p></div>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {hourlyPedidos.map((count, i) => {
              const height = count > 0 ? Math.max((count / maxHourly) * 100, 8) : 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-all relative group" style={{ height: `${height}%` }}>
                    {count > 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
                        {count} pedido{count !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500">{String(i).padStart(2, '0')}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Acciones Rapidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/pedidos" className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition"><span className="text-sm font-medium">Nuevo Pedido</span></Link>
          <Link href="/clientes" className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition"><span className="text-sm font-medium">Nuevo Cliente</span></Link>
          <Link href="/embarques" className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition"><span className="text-sm font-medium">Nuevo Embarque</span></Link>
          <Link href="/produccion" className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition"><span className="text-sm font-medium">Produccion</span></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Stock Disponible</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 p-4 rounded-xl text-center"><p className="text-sm text-gray-500 mb-1">Agua</p><p className="text-3xl font-bold text-blue-600">{stockAgua}</p><p className="text-xs text-gray-400">pacas</p></div>
            <div className="bg-cyan-50 p-4 rounded-xl text-center"><p className="text-sm text-gray-500 mb-1">Hielo</p><p className="text-3xl font-bold text-cyan-600">{stockHielo}</p><p className="text-xs text-gray-400">pacas</p></div>
            <div className="bg-purple-50 p-4 rounded-xl text-center"><p className="text-sm text-gray-500 mb-1">Botellon</p><p className="text-3xl font-bold text-purple-600">{stockBotellon}</p><p className="text-xs text-gray-400">und</p></div>
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">Stock inicial + Produccion - Ventas entregadas</p>
          <Link href="/produccion" className="block mt-3 text-center text-sm text-blue-600 hover:underline">Registrar produccion</Link>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Resumen de Caja</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100"><span className="text-gray-600">Base del dia</span><span className="font-medium">{formatCurrency(baseDia)}</span></div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100"><span className="text-gray-600">+ Ventas cobradas</span><span className="font-medium text-green-600">{formatCurrency(ventas - fiadosHoy)}</span></div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100"><span className="text-gray-600">- Gastos</span><span className="font-medium text-red-600">{formatCurrency(totalGastos)}</span></div>
            <div className="flex justify-between items-center py-3 bg-gray-50 rounded-lg px-3 mt-2"><span className="font-semibold text-gray-800">= Efectivo esperado</span><span className="font-bold text-lg text-green-600">{formatCurrency(baseDia + (ventas - fiadosHoy) - totalGastos)}</span></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="bg-yellow-50 p-3 rounded-lg text-center"><p className="text-gray-500">Fiados hoy</p><p className="font-bold text-yellow-600">{formatCurrency(fiadosHoy)}</p></div>
            <div className="bg-blue-50 p-3 rounded-lg text-center"><p className="text-gray-500">Total ventas</p><p className="font-bold text-blue-600">{formatCurrency(ventas)}</p></div>
          </div>
          <Link href="/cierre" className="block mt-4 text-center text-sm text-blue-600 hover:underline">Ver cierre completo</Link>
        </div>
      </div>
    </div>
  )
}
