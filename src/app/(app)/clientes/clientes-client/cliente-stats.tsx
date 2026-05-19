'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { ClienteStats } from './types'

interface ClienteStatsProps {
  clienteId: string
}

export function ClienteStats({ clienteId }: ClienteStatsProps) {
  const [stats, setStats] = useState<ClienteStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/clientes/${clienteId}/stats`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (!controller.signal.aborted) {
          if (data.success) setStats(data.stats)
          else setError(data.error?.message || 'Error')
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError' && !controller.signal.aborted) setError('Error de conexión')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [clienteId])

  const refetch = useCallback(() => {
    setError('')
    setLoading(true)
    fetch(`/api/clientes/${clienteId}/stats`)
      .then(r => r.json())
      .then(data => {
        if (data.success) { setStats(data.stats); setError('') }
        else setError(data.error?.message || 'Error')
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false))
  }, [clienteId])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 text-sm mb-2">{error}</p>
        <button
          onClick={refetch}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!stats) {
    return <div className="text-center py-8 text-gray-500">Sin datos</div>
  }

  const maxEvo = Math.max(...stats.evolucionMensual.map(e => e.total), 1)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500">
          <p className="text-xs text-gray-500">Total comprado</p>
          <p className="text-xl font-bold text-gray-800">{formatCurrency(stats.totalComprado)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500">
          <p className="text-xs text-gray-500">Total pagado</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(stats.totalPagado)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-red-500">
          <p className="text-xs text-gray-500">Saldo pendiente</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(stats.totalFiado)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-purple-500">
          <p className="text-xs text-gray-500">Pedidos totales</p>
          <p className="text-xl font-bold text-purple-600">{stats.cantidadPedidos}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Promedio por pedido</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(stats.promedioPorPedido)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Frecuencia real</p>
          <p className="text-lg font-bold text-gray-800">
            {stats.frecuenciaRealDias ? `Cada ${stats.frecuenciaRealDias} días` : 'N/D'}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <p className="text-xs text-gray-500">Días promedio para pagar</p>
          <p className="text-lg font-bold text-gray-800">
            {stats.diasPromedioPago !== null ? `${stats.diasPromedioPago} días` : 'N/D'}
          </p>
        </div>
      </div>

      {/* Pedidos recientes */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-xl text-center">
          <p className="text-sm text-blue-700">Últimos 30 días</p>
          <p className="text-2xl font-bold text-blue-800">{stats.cantidadPedidosUltimos30}</p>
          <p className="text-xs text-blue-600">pedidos</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-xl text-center">
          <p className="text-sm text-blue-700">Últimos 90 días</p>
          <p className="text-2xl font-bold text-blue-800">{stats.cantidadPedidosUltimos90}</p>
          <p className="text-xs text-blue-600">pedidos</p>
        </div>
      </div>

      {/* Productos favoritos */}
      {stats.productosFavoritos.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Productos favoritos</h3>
          <div className="space-y-2">
            {stats.productosFavoritos.map((p) => (
              <div key={p.nombre} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{p.nombre}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{p.cantidadTotal} und</span>
                  <span className="font-semibold text-blue-600">{formatCurrency(p.totalVendido)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolución mensual (barras CSS) */}
      {stats.evolucionMensual.some(e => e.total > 0) && (
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Evolución mensual (24 meses)</h3>
          <div className="flex items-end gap-[3px] h-32">
            {stats.evolucionMensual.map((e) => {
              const h = e.total > 0 ? Math.max((e.total / maxEvo) * 100, 4) : 2
              return (
                <div key={e.mes} className="flex-1 h-full flex flex-col justify-end items-center group relative">
                  <div
                    className={`w-full rounded-t transition-all ${e.total > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-200'}`}
                    style={{ height: `${h}%`, minHeight: e.total > 0 ? '4px' : '2px' }}
                  />
                  <span className="text-[9px] text-gray-500 mt-1 rotate-45 origin-left translate-y-2">
                    {e.mes.slice(5)}
                  </span>
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                    {e.mes}: {formatCurrency(e.total)} ({e.pedidos} pedidos)
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Métodos de pago */}
      {stats.metodosPago.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Métodos de pago</h3>
          <div className="space-y-2">
            {stats.metodosPago.map((m) => (
              <div key={m.metodo} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{m.metodo}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{m.count} veces</span>
                  <span className="font-semibold text-green-600">{formatCurrency(m.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
