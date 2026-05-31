'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import type { DashboardData } from './types'
import { useBaseCaja } from '@/hooks/use-base-caja'

export function DashboardClient({ data }: { data: DashboardData }) {
  const { baseDia: baseDiaLocal } = useBaseCaja()
  const baseDia = baseDiaLocal ? Number(baseDiaLocal) : data.baseDia
  const {
    pedidos,
    ventas,
    fiadosTotal,
    clientesConFiado,
    pedidosPendientes,
    pedidosEntregados,
    totalGastos,
    ventasTrend,
    pedidosTrend,
    franjas,
    maxFranja,
    ventasPorPrecio,
    stockAgua,
    stockHielo,
    stockBotellon,
    embarquesAbiertos,
    stockAlertas,
    fechaHoy,
    alertasRiesgo,
    casosActivos,
  } = data

  const fiadosHoy = data.fiadosHoy

  function RefreshBadge() {
    const [minutes, setMinutes] = useState(0)
    useEffect(() => {
      const interval = setInterval(() => setMinutes(m => m + 1), 60000)
      return () => clearInterval(interval)
    }, [])
    const label = minutes === 0 ? 'Actualizado ahora' : minutes === 1 ? 'Actualizado hace 1 min' : `Actualizado hace ${minutes} min`
    return (
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border rounded-lg hover:bg-gray-50 transition cursor-pointer"
        aria-label="Actualizar dashboard"
        title="Click para actualizar"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        {label}
      </button>
    )
  }

  const totalAlertasRiesgo =
    alertasRiesgo.disputasAbiertas +
    alertasRiesgo.clientesBloqueados +
    alertasRiesgo.clientesConflictivos +
    alertasRiesgo.promesasProximasVencer +
    alertasRiesgo.clientesNoVerificados

  const trendArrow = (val: number) => (val > 0 ? '↑' : val < 0 ? '↓' : '→')
  const trendClass = (val: number) =>
    val > 0 ? 'text-green-600' : val < 0 ? 'text-red-600' : 'text-gray-400'

  const IconDisputa = () => (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2M6 7l-3-1m0 0l3-1m-3 1l6 2m0 0l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0 0l-3 1m3-1l3 9a5.002 5.002 0 006.001 0M12 7l3 1" /></svg>
  )
  const IconBloqueado = () => (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
  )
  const IconConflicto = () => (
    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
  )
  const IconPromesa = () => (
    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )
  const IconVerificar = () => (
    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )
  const IconCaso = () => (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
  )
  const IconCritico = () => (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
  )
  const IconEspera = () => (
    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 capitalize">{fechaHoy}</p>
        </div>
        <RefreshBadge />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Pedidos del Día</p>
          <p className="text-3xl font-bold text-gray-800">{pedidos.length}</p>
          <p className="text-xs text-gray-400 mt-1">
            {pedidosPendientes} pendientes · {pedidosEntregados} entregados
          </p>
          <p className={`text-xs mt-1 font-medium ${trendClass(pedidosTrend)}`}>
            {trendArrow(pedidosTrend)} {Math.abs(pedidosTrend).toFixed(0)}% vs ayer
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Ventas del Día</p>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(ventas)}</p>
          <p className="text-xs text-gray-400 mt-1">Total vendido</p>
          <p className={`text-xs mt-1 font-medium ${trendClass(ventasTrend)}`}>
            {trendArrow(ventasTrend)} {Math.abs(ventasTrend).toFixed(0)}% vs ayer
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-emerald-500">
          <p className="text-sm text-gray-500">Efectivo Cobrado</p>
          <p className="text-3xl font-bold text-emerald-600">{formatCurrency(ventas - fiadosHoy)}</p>
          <p className="text-xs text-gray-400 mt-1">Ventas - fiados hoy</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">Gastos del Día</p>
          <p className="text-3xl font-bold text-orange-600">{formatCurrency(totalGastos)}</p>
          <p className="text-xs text-gray-400 mt-1">Total gastado</p>
        </div>
      </div>

      {/* Alertas de Riesgo — siempre visible */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Alertas de Riesgo</h2>
        {totalAlertasRiesgo === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <p className="text-sm text-green-800 font-medium">Todo en orden. No hay alertas activas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {alertasRiesgo.disputasAbiertas > 0 && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconDisputa />
                  <div>
                    <p className="text-sm font-medium text-red-800">Disputas abiertas</p>
                    <p className="text-xs text-red-600">{alertasRiesgo.disputasAbiertas} sin resolver</p>
                  </div>
                </div>
                <Link href="/pedidos" className="text-xs text-red-700 hover:underline mt-2 inline-block">Ver pedidos →</Link>
              </div>
            )}
            {alertasRiesgo.clientesBloqueados > 0 && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconBloqueado />
                  <div>
                    <p className="text-sm font-medium text-red-800">Clientes bloqueados</p>
                    <p className="text-xs text-red-600">{alertasRiesgo.clientesBloqueados} bloqueados</p>
                  </div>
                </div>
                <Link href="/clientes?bloqueado=true" className="text-xs text-red-700 hover:underline mt-2 inline-block">Ver clientes →</Link>
              </div>
            )}
            {alertasRiesgo.clientesConflictivos > 0 && (
              <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconConflicto />
                  <div>
                    <p className="text-sm font-medium text-orange-800">Clientes conflictivos</p>
                    <p className="text-xs text-orange-600">{alertasRiesgo.clientesConflictivos} con 3+ reclamaciones</p>
                  </div>
                </div>
                <Link href="/clientes?reclamaciones=gte3" className="text-xs text-orange-700 hover:underline mt-2 inline-block">Ver clientes →</Link>
              </div>
            )}
            {alertasRiesgo.promesasProximasVencer > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconPromesa />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Promesas por vencer</p>
                    <p className="text-xs text-amber-600">{alertasRiesgo.promesasProximasVencer} en 2 días</p>
                  </div>
                </div>
                <Link href="/pedidos?tab=fiados" className="text-xs text-amber-700 hover:underline mt-2 inline-block">Ver fiados →</Link>
              </div>
            )}
            {alertasRiesgo.clientesNoVerificados > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconVerificar />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Sin verificar</p>
                    <p className="text-xs text-yellow-600">{alertasRiesgo.clientesNoVerificados} +30 días</p>
                  </div>
                </div>
                <Link href="/clientes?noVerificado=true" className="text-xs text-yellow-700 hover:underline mt-2 inline-block">Ver clientes →</Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Casos Activos — siempre visible */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Casos Activos</h2>
          <Link href="/casos" className="text-sm text-blue-600 hover:underline">Ver todos →</Link>
        </div>
        {casosActivos.total === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <p className="text-sm text-gray-600 font-medium">No hay casos activos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
              <div className="flex items-center gap-2">
                <IconCaso />
                <div>
                  <p className="text-sm font-medium text-red-800">Total abiertos</p>
                  <p className="text-2xl font-bold text-red-600">{casosActivos.total}</p>
                </div>
              </div>
            </div>
            {casosActivos.criticos > 0 && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconCritico />
                  <div>
                    <p className="text-sm font-medium text-red-800">Críticos</p>
                    <p className="text-2xl font-bold text-red-600">{casosActivos.criticos}</p>
                  </div>
                </div>
              </div>
            )}
            {casosActivos.sinResolver48h > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconEspera />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Sin resolver +48h</p>
                    <p className="text-2xl font-bold text-amber-600">{casosActivos.sinResolver48h}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ventas por Precio */}
      <div className="bg-white p-5 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Ventas por Precio</h2>
        {ventasPorPrecio.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="mb-3">No hay ventas registradas hoy</p>
            <Link
              href="/pedidos"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              Crear primer pedido
            </Link>
          </div>
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

      {/* Resumen por Producto */}
      {ventasPorPrecio.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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

      {/* Pedidos por Franja Horaria */}
      <div className="bg-white p-5 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Pedidos por Franja Horaria</h2>
        {pedidos.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p>No hay pedidos registrados hoy</p></div>
        ) : (
          <div className="flex items-end gap-3 h-44">
            {franjas.map((f) => {
              const heightPct = f.count > 0 ? Math.max((f.count / maxFranja) * 100, 10) : 0
              return (
                <div key={f.label} className="flex-1 h-full flex flex-col justify-end items-center">
                  <span className="text-sm font-semibold text-gray-700 leading-none mb-1">{f.count}</span>
                  <div
                    className={`w-full rounded-t transition-all ${f.count > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-200'}`}
                    style={{ height: f.count > 0 ? `${heightPct}%` : '4px', minHeight: f.count > 0 ? '10px' : '4px' }}
                  />
                  <span className="text-xs text-gray-500 mt-2 text-center">{f.label}</span>
                  <span className="text-[10px] text-gray-400">{String(f.range[0]).padStart(2, '0')}-{String(f.range[1]).padStart(2, '0')}h</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Acciones Rápidas — honestas */}
      <div className="bg-white p-5 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Acciones Rápidas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/pedidos" className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            <span className="text-sm font-medium">Ir a Pedidos</span>
          </Link>
          <Link href="/clientes" className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-sm font-medium">Ir a Clientes</span>
          </Link>
          <Link href="/embarques" className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m0 0a2 2 0 104 0m0 0a2 2 0 104 0" /></svg>
            <span className="text-sm font-medium">Ir a Embarques</span>
          </Link>
          <Link href="/produccion" className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            <span className="text-sm font-medium">Ir a Producción</span>
          </Link>
        </div>
      </div>

      {/* Inventario y Caja + Cartera */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock */}
        <div className="bg-white p-5 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Inventario</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 mb-1">Agua</p>
              <p className="text-3xl font-bold text-blue-600">{stockAgua}</p>
              <p className="text-xs text-gray-400">pacas</p>
            </div>
            <div className="bg-cyan-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 mb-1">Hielo</p>
              <p className="text-3xl font-bold text-cyan-600">{stockHielo}</p>
              <p className="text-xs text-gray-400">pacas</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 mb-1">Botellón</p>
              <p className="text-3xl font-bold text-purple-600">{stockBotellon}</p>
              <p className="text-xs text-gray-400">und</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">Stock inicial + Producción - Ventas entregadas</p>
          <Link href="/produccion" className="block mt-3 text-center text-sm text-blue-600 hover:underline">Registrar producción</Link>
        </div>

        {/* Caja */}
        <div className="bg-white p-5 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Resumen de Caja</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100"><span className="text-gray-600">Base del día</span><span className="font-medium">{formatCurrency(baseDia)}</span></div>
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

        {/* Cartera */}
        <div className="bg-white p-5 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Cartera</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Cuentas por cobrar</span>
              <span className="text-xl font-bold text-red-600">{formatCurrency(fiadosTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Clientes con deuda</span>
              <span className="text-xl font-bold text-gray-800">{String(clientesConFiado)}</span>
            </div>
            {embarquesAbiertos > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Embarques activos</span>
                <span className="text-xl font-bold text-orange-600">{embarquesAbiertos}</span>
              </div>
            )}
            {stockAlertas.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-orange-700 mb-2">Stock bajo</p>
                <div className="space-y-1.5">
                  {stockAlertas.map((insumo) => (
                    <div key={insumo.id} className="flex justify-between text-sm">
                      <span className="text-gray-600">{insumo.nombre}</span>
                      <span className="font-medium text-orange-600">{Number(insumo.stock)} {insumo.unidad}</span>
                    </div>
                  ))}
                </div>
                <Link href="/insumos" className="text-xs text-orange-600 hover:underline mt-2 inline-block">Reponer →</Link>
              </div>
            )}
            <Link
              href="/pedidos?tab=fiados"
              className="block w-full text-center px-4 py-2 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100 transition"
            >
              Ver fiados y cobros
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
