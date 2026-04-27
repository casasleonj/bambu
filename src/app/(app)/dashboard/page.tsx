'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'

interface Stats {
  pedidos: number
  ventas: number
  pagado: number
  fiado: number
  cartera: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    pedidos: 0,
    ventas: 0,
    pagado: 0,
    fiado: 0,
    cartera: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [ventasRes, carteraRes] = await Promise.all([
        fetch('/api/reportes/ventas'),
        fetch('/api/reportes/cartera'),
      ])

      const ventasData = await ventasRes.json()
      const carteraData = await carteraRes.json()

      setStats({
        pedidos: ventasData.resumen?.totalPedidos || 0,
        ventas: ventasData.resumen?.totalVentas || 0,
        pagado: ventasData.resumen?.totalPagado || 0,
        fiado: ventasData.resumen?.totalFiado || 0,
        cartera: carteraData.totalCartera || 0,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500">{new Date().toLocaleDateString('es-CO')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Pedidos (30d)</p>
          <p className="text-3xl font-bold text-gray-800">{stats.pedidos}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Ventas (30d)</p>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(stats.ventas)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Cartera</p>
          <p className="text-3xl font-bold text-red-600">{formatCurrency(stats.cartera)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">Pagado (30d)</p>
          <p className="text-3xl font-bold text-yellow-600">{formatCurrency(stats.pagado)}</p>
        </div>
      </div>
    </div>
  )
}
