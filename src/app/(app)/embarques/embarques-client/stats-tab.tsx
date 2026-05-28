'use client'

import { useState, useEffect, useCallback } from 'react'
import { Skeleton } from '@/components/skeleton'
import { StatsKpiCards } from './stats-kpi-cards'
import { StatsByWorker } from './stats-by-worker'
import { StatsByRoute } from './stats-by-route'
import { StatsTimeline } from './stats-timeline'

interface StatsData {
  kpiGeneral: {
    totalEmbarques: number
    duracionPromedioMin: number | null
    duracionMedianaMin: number | null
    duracionMinMin: number | null
    duracionMaxMin: number | null
    entregasPorHoraPromedio: number | null
    tasaEntregaPromedio: number
    tasaNoEntregaPromedio: number
    tiempoPreparacionPromedioMin: number | null
    discrepanciaPromedioPct: number
    totalPedidos: number
    totalEntregados: number
    totalNoEntregados: number
  } | null
  porTrabajador: Array<{
    trabajadorId: string
    nombre: string
    totalEmbarques: number
    duracionPromedioMin: number | null
    entregasPorHoraPromedio: number | null
    tasaEntrega: number
    tasaNoEntrega: number
    discrepanciaPct: number
    totalPedidos: number
    totalEntregados: number
  }>
  porRuta: Array<{
    rutaId: string | null
    nombre: string | null
    totalEmbarques: number
    duracionPromedioMin: number | null
    entregasPorHoraPromedio: number | null
    tasaEntrega: number
    tasaNoEntrega: number
    totalPedidos: number
    totalEntregados: number
  }>
  tendenciaDiaria: Array<{
    fecha: string
    totalEmbarques: number
    duracionPromedioMin: number | null
    entregasPorHoraPromedio: number | null
    tasaEntrega: number
  }>
  embarquesDetalle: Array<{
    id: string
    numero: number
    numeroDia: number
    fecha: string
    trabajadorNombre: string
    rutaNombre: string | null
    estado: string
    duracionMin: number | null
    totalPedidos: number
    entregados: number
  }>
}

interface StatsTabProps {
  dateRange: { desde: string | null; hasta: string | null }
}

export function StatsTab({ dateRange }: StatsTabProps) {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (dateRange.desde && dateRange.hasta) {
        params.set('desde', dateRange.desde)
        params.set('hasta', dateRange.hasta)
      }

      const res = await fetch(`/api/embarques/stats?${params.toString()}`, {
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error('Error al cargar estadísticas')
      }

      const json = await res.json()
      setData(json.data ?? json)
    } catch {
      setError('No se pudieron cargar las estadísticas')
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!data?.kpiGeneral || data.kpiGeneral.totalEmbarques === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-3xl mb-3">📊</p>
        <p className="text-gray-600 font-medium">
          No hay embarques cerrados en este período
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Las estadísticas se calculan solo con embarques que han sido cerrados
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <StatsKpiCards kpi={data.kpiGeneral} />

      {/* Timeline */}
      <StatsTimeline data={data.tendenciaDiaria} />

      {/* By Worker + By Route side by side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <StatsByWorker data={data.porTrabajador} />
        <StatsByRoute data={data.porRuta} />
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-800">Detalle de Embarques</h3>
          <p className="text-xs text-gray-500">
            Todos los embarques en el período seleccionado
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-2 font-medium text-gray-600">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Repartidor</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Ruta</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Estado</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Duración</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Entregas</th>
              </tr>
            </thead>
            <tbody>
              {data.embarquesDetalle.map((e) => {
                const estadoStyles: Record<string, string> = {
                  ABIERTO: 'bg-green-100 text-green-800',
                  EN_RUTA: 'bg-blue-100 text-blue-800',
                  CERRADO: 'bg-gray-100 text-gray-800',
                  CANCELADO: 'bg-red-100 text-red-800',
                }
                return (
                  <tr key={e.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">#{e.numeroDia}</td>
                    <td className="px-3 py-2">
                      {new Date(e.fecha).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="px-3 py-2">{e.trabajadorNombre}</td>
                    <td className="px-3 py-2">{e.rutaNombre ?? '—'}</td>
                    <td className="text-center px-3 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${estadoStyles[e.estado] ?? ''}`}
                      >
                        {e.estado === 'EN_RUTA' ? 'En Ruta' : e.estado}
                      </span>
                    </td>
                    <td className="text-center px-3 py-2">
                      {e.duracionMin !== null ? (
                        <span
                          className={`text-xs font-medium ${
                            e.duracionMin > 120
                              ? 'text-red-600'
                              : e.duracionMin > 90
                                ? 'text-yellow-600'
                                : 'text-green-600'
                          }`}
                        >
                          {e.duracionMin < 60
                            ? `${e.duracionMin}m`
                            : `${Math.floor(e.duracionMin / 60)}h ${e.duracionMin % 60}m`}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-center px-3 py-2">
                      {e.entregados}/{e.totalPedidos}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
