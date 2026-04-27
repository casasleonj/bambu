'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'

interface VentaPorPrecio {
  producto: string
  precio: number
  cantidad: number
  subtotal: number
}

interface Stats {
  pedidos: number
  pedidosPendientes: number
  pedidosEntregados: number
  ventas: number
  fiados: number
  baseDia: number
  ventasPorPrecio: VentaPorPrecio[]
  embarquesAbiertos: number
  stockAgua: number
  stockHielo: number
  stockBotellon: number
  totalGastos: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    pedidos: 0,
    pedidosPendientes: 0,
    pedidosEntregados: 0,
    ventas: 0,
    fiados: 0,
    baseDia: 0,
    ventasPorPrecio: [],
    embarquesAbiertos: 0,
    stockAgua: 0,
    stockHielo: 0,
    stockBotellon: 0,
    totalGastos: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    try {
      const pedidosRes = await fetch('/api/pedidos')
      const pedidosData = await pedidosRes.json()
      const pedidos = pedidosData.pedidos || []
      
      const ventas = pedidos.reduce((acc: number, p: any) => acc + p.total, 0)
      const fiados = pedidos.filter((p: any) => p.saldo > 0).reduce((acc: number, p: any) => acc + p.saldo, 0)

      // Calcular ventas por precio
      const ventasPorPrecio: VentaPorPrecio[] = []
      
      // Agua
      if (pedidos.length > 0) {
        const ventasAgua: Record<number, number> = {}
        const ventasHielo: Record<number, number> = {}
        const ventasBotellon: Record<number, number> = {}
        const ventasBolsaAgua: Record<number, number> = {}
        const ventasBolsaHielo: Record<number, number> = {}
        
        pedidos.forEach((p: any) => {
          if (p.cAguaEnt > 0 && p.precioAgua > 0) {
            ventasAgua[p.precioAgua] = (ventasAgua[p.precioAgua] || 0) + p.cAguaEnt
          }
          if (p.cHieloEnt > 0 && p.precioHielo > 0) {
            ventasHielo[p.precioHielo] = (ventasHielo[p.precioHielo] || 0) + p.cHieloEnt
          }
          if (p.cBotellonEnt > 0 && p.precioBotellon > 0) {
            ventasBotellon[p.precioBotellon] = (ventasBotellon[p.precioBotellon] || 0) + p.cBotellonEnt
          }
          if (p.cBolsaAguaEnt > 0 && p.precioBolsaAgua > 0) {
            ventasBolsaAgua[p.precioBolsaAgua] = (ventasBolsaAgua[p.precioBolsaAgua] || 0) + p.cBolsaAguaEnt
          }
          if (p.cBolsaHieloEnt > 0 && p.precioBolsaHielo > 0) {
            ventasBolsaHielo[p.precioBolsaHielo] = (ventasBolsaHielo[p.precioBolsaHielo] || 0) + p.cBolsaHieloEnt
          }
        })
        
        Object.entries(ventasAgua).forEach(([precio, cantidad]) => {
          ventasPorPrecio.push({
            producto: 'Agua 19L',
            precio: parseFloat(precio),
            cantidad,
            subtotal: parseFloat(precio) * cantidad
          })
        })
        Object.entries(ventasHielo).forEach(([precio, cantidad]) => {
          ventasPorPrecio.push({
            producto: 'Hielo',
            precio: parseFloat(precio),
            cantidad,
            subtotal: parseFloat(precio) * cantidad
          })
        })
        Object.entries(ventasBotellon).forEach(([precio, cantidad]) => {
          ventasPorPrecio.push({
            producto: 'Botellón',
            precio: parseFloat(precio),
            cantidad,
            subtotal: parseFloat(precio) * cantidad
          })
        })
        Object.entries(ventasBolsaAgua).forEach(([precio, cantidad]) => {
          ventasPorPrecio.push({
            producto: 'Bolsa Agua',
            precio: parseFloat(precio),
            cantidad,
            subtotal: parseFloat(precio) * cantidad
          })
        })
        Object.entries(ventasBolsaHielo).forEach(([precio, cantidad]) => {
          ventasPorPrecio.push({
            producto: 'Bolsa Hielo',
            precio: parseFloat(precio),
            cantidad,
            subtotal: parseFloat(precio) * cantidad
          })
        })
      }

      // Base de caja
      const configRes = await fetch('/api/config?clave=BASE_DIA')
      const configData = await configRes.json()
      const baseDia = configData.config ? parseFloat(configData.config.valor) : 0
      
      // Producción (stock)
      const prodRes = await fetch('/api/produccion')
      const prodData = await prodRes.json()
      const produccion = prodData.produccion
      
      // Ventas entregadas (pacas)
      const aguaEntregada = pedidos.filter((p: any) => p.estado === 'ENTREGADO').reduce((acc: number, p: any) => acc + (p.cAguaEnt || 0), 0)
      const hieloEntregado = pedidos.filter((p: any) => p.estado === 'ENTREGADO').reduce((acc: number, p: any) => acc + (p.cHieloEnt || 0), 0)
      
      // Stock disponible durante el día = Stock Inicial - Ventas entregadas
      // (La producción se conoce al final del día)
      
      // Ventas entregadas hoy
      const aguaVendida = pedidos.filter((p: any) => p.estado === 'ENTREGADO').reduce((acc: number, p: any) => acc + (p.cAguaEnt || 0), 0)
      const hieloVendido = pedidos.filter((p: any) => p.estado === 'ENTREGADO').reduce((acc: number, p: any) => acc + (p.cHieloEnt || 0), 0)
      const botellonVendido = pedidos.filter((p: any) => p.estado === 'ENTREGADO').reduce((acc: number, p: any) => acc + (p.cBotellonEnt || 0), 0)
      
      // Obtener stock inicial del último cierre
      let stockIniAgua = 0
      let stockIniHielo = 0
      let stockIniBotellon = 0
      
      const cierreRes = await fetch('/api/cierre/last')
      const cierreData = await cierreRes.json()
      if (cierreData.cierre) {
        stockIniAgua = cierreData.cierre.stockFinAgua || 0
        stockIniHielo = cierreData.cierre.stockFinHielo || 0
      }
      
      // Si no hay cierre anterior, usar configuración de stock inicial
      if (stockIniAgua === 0 && stockIniHielo === 0) {
        const configRes = await fetch('/api/config?keys=STOCK_INI_AGUA,STOCK_INI_HIELO')
        const configData = await configRes.json()
        if (configData.STOCK_INI_AGUA) stockIniAgua = parseInt(configData.STOCK_INI_AGUA) || 0
        if (configData.STOCK_INI_HIELO) stockIniHielo = parseInt(configData.STOCK_INI_HIELO) || 0
        if (configData.STOCK_INI_BOTELLON) stockIniBotellon = parseInt(configData.STOCK_INI_BOTELLON) || 0
      }
      
      // Stock disponible = Stock Inicial - Ventas
      const stockAgua = Math.max(0, stockIniAgua - aguaVendida)
      const stockHielo = Math.max(0, stockIniHielo - hieloVendido)
      const stockBotellon = Math.max(0, stockIniBotellon - botellonVendido)
      
      // Gastos del día
      const gastosRes = await fetch('/api/gastos')
      const gastosData = await gastosRes.json()
      const totalGastos = gastosData.total || 0
      
      // Embarques
      const embRes = await fetch('/api/embarques')
      const embData = await embRes.json()
      const embarques = embData.embarques || []
      
      setStats({
        pedidos: pedidos.length,
        pedidosPendientes: pedidos.filter((p: any) => p.estado === 'PENDIENTE').length,
        pedidosEntregados: pedidos.filter((p: any) => p.estado === 'ENTREGADO').length,
        ventas,
        fiados,
        baseDia,
        ventasPorPrecio,
        embarquesAbiertos: embarques.filter((e: any) => e.estado === 'ABIERTO').length,
        stockAgua,
        stockHielo,
        stockBotellon,
        totalGastos,
      })
    } catch (error) {
      console.error('Error fetching dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 capitalize">{fechaHoy}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pedidos del Día</p>
              <p className="text-3xl font-bold text-gray-800">{stats.pedidos}</p>
              <p className="text-xs text-gray-400 mt-1">
                {stats.pedidosPendientes} pendientes • {stats.pedidosEntregados} entregados
              </p>
            </div>
            <span className="text-4xl">📦</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Ventas del Día</p>
              <p className="text-3xl font-bold text-green-600">{formatCurrency(stats.ventas)}</p>
              <p className="text-xs text-gray-400 mt-1">Total vendido</p>
            </div>
            <span className="text-4xl">💰</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Cuentas por Cobrar</p>
              <p className="text-3xl font-bold text-red-600">{formatCurrency(stats.fiados)}</p>
              <p className="text-xs text-gray-400 mt-1">Saldo pendiente</p>
            </div>
            <span className="text-4xl">📋</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Embarques Activos</p>
              <p className="text-3xl font-bold text-orange-600">{stats.embarquesAbiertos}</p>
              <p className="text-xs text-gray-400 mt-1">En curso</p>
            </div>
            <span className="text-4xl">🚚</span>
          </div>
        </div>
      </div>

      {/* Ventas por Precio */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">📊 Ventas por Precio</h2>
        {stats.ventasPorPrecio.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <span className="text-4xl mb-2 block">📦</span>
            <p>No hay ventas registradas hoy</p>
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
                {stats.ventasPorPrecio.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{item.producto}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                        {formatCurrency(item.precio)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-2xl font-bold text-gray-800">{item.cantidad}</span>
                      <span className="text-sm text-gray-400 ml-1">pacas</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-green-600">{formatCurrency(item.subtotal)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-800">TOTAL:</td>
                  <td className="px-4 py-3 text-right font-bold text-green-600 text-lg">
                    {formatCurrency(stats.ventas)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Resumen por Producto */}
      {stats.ventasPorPrecio.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {['Agua 19L', 'Hielo', 'Botellón', 'Bolsa Agua', 'Bolsa Hielo'].map((producto) => {
            const items = stats.ventasPorPrecio.filter(v => v.producto === producto)
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

      {/* Acciones Rápidas */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">⚡ Acciones Rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a href="/pedidos" className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
            <span className="text-2xl">📦</span>
            <span className="text-sm font-medium">Nuevo Pedido</span>
          </a>
          <a href="/clientes" className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition">
            <span className="text-2xl">👥</span>
            <span className="text-sm font-medium">Nuevo Cliente</span>
          </a>
          <a href="/embarques" className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition">
            <span className="text-2xl">🚚</span>
            <span className="text-sm font-medium">Nuevo Embarque</span>
          </a>
          <a href="/produccion" className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition">
            <span className="text-2xl">🏭</span>
            <span className="text-sm font-medium">Producción</span>
          </a>
        </div>
      </div>

      {/* Stock y Resumen de Caja */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stock */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📦 Stock Disponible</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 mb-1">Agua</p>
              <p className="text-3xl font-bold text-blue-600">{stats.stockAgua}</p>
              <p className="text-xs text-gray-400">pacas</p>
            </div>
            <div className="bg-cyan-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 mb-1">Hielo</p>
              <p className="text-3xl font-bold text-cyan-600">{stats.stockHielo}</p>
              <p className="text-xs text-gray-400">pacas</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 mb-1">Botellón</p>
              <p className="text-3xl font-bold text-purple-600">{stats.stockBotellon}</p>
              <p className="text-xs text-gray-400">und</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">
            Stock inicial + Producción - Ventas entregadas
          </p>
          <a href="/produccion" className="block mt-3 text-center text-sm text-blue-600 hover:underline">
            Registrar producción →
          </a>
        </div>

        {/* Resumen Rápido de Caja */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">💰 Resumen de Caja</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Base del día</span>
              <span className="font-medium">{formatCurrency(stats.baseDia)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">+ Ventas cobradas</span>
              <span className="font-medium text-green-600">{formatCurrency(stats.ventas - stats.fiados)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">- Gastos</span>
              <span className="font-medium text-red-600">{formatCurrency(stats.totalGastos)}</span>
            </div>
            <div className="flex justify-between items-center py-3 bg-gray-50 rounded-lg px-3 mt-2">
              <span className="font-semibold text-gray-800">= Efectivo esperado</span>
              <span className="font-bold text-lg text-green-600">
                {formatCurrency(stats.baseDia + (stats.ventas - stats.fiados) - stats.totalGastos)}
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="bg-yellow-50 p-3 rounded-lg text-center">
              <p className="text-gray-500">Fiados</p>
              <p className="font-bold text-yellow-600">{formatCurrency(stats.fiados)}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <p className="text-gray-500">Total ventas</p>
              <p className="font-bold text-blue-600">{formatCurrency(stats.ventas)}</p>
            </div>
          </div>
          <a href="/cierre" className="block mt-4 text-center text-sm text-blue-600 hover:underline">
            Ver cierre completo →
          </a>
        </div>
      </div>
    </div>
  )
}