'use client'

/**
 * Forecast de producción — Bloque 3 Cara B.
 *
 * Predicción agregada de pedidos por día de la semana, basada en el
 * historial. Útil para que el admin decida cuánta agua/hielo producir
 * cada día de la semana.
 *
 * Render: SVG inline (sin libs de charts para mantener bundle chico).
 */

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { MoneyDisplay } from '@/components/money-display'

interface DiaPronostico {
  diaSemana: number
  nombre: string
  promedioPedidos: number
  promedioMonto: number
  desvMonto: number
  coefVariacion: number
  nSemanas: number
}

interface ForecastData {
  porDia: DiaPronostico[]
  confianza: 'ALTA' | 'MEDIA' | 'BAJA'
  pedidosPorSemana: number
  montoPorSemana: number
  totalSemanasObservadas: number
  totalPedidosObservados: number
  semanasConsultadas: number
  generadoEn: string
}

const CONFIANZA_COLOR: Record<ForecastData['confianza'], string> = {
  ALTA: 'bg-emerald-100 text-emerald-700',
  MEDIA: 'bg-amber-100 text-amber-700',
  BAJA: 'bg-red-100 text-red-700',
}

export function ForecastClient() {
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [semanas, setSemanas] = useState(8)

  const fetchForecast = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/forecast-produccion?semanas=${semanas}`)
      const j = await r.json()
      if (j.success) {
        setData(j.data ?? j) // apiSuccess spreads keys
      } else {
        toast.error(j.error?.message || 'Error al cargar forecast')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setLoading(false)
    }
  }, [semanas])

  useEffect(() => {
    fetchForecast()
  }, [fetchForecast])

  if (loading || !data) {
    return <div className="p-8 text-center text-gray-500">Cargando forecast…</div>
  }

  const maxMonto = Math.max(1, ...data.porDia.map(d => d.promedioMonto))
  const maxPedidos = Math.max(1, ...data.porDia.map(d => d.promedioPedidos))

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto" data-testid="forecast-page">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Forecast de producción</h1>
          <p className="text-sm text-gray-500 mt-1">
            Predicción por día de la semana, basada en las últimas{' '}
            <strong>{data.semanasConsultadas}</strong> semanas. Útil para decidir cuánta agua
            e hielo producir por día.
          </p>
        </div>
        <select
          value={semanas}
          onChange={(e) => setSemanas(Number(e.target.value))}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
        >
          <option value={4}>Últimas 4 semanas</option>
          <option value={8}>Últimas 8 semanas</option>
          <option value={12}>Últimas 12 semanas</option>
          <option value={26}>Últimas 26 semanas</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Confianza</div>
          <div className="mt-1">
            <span className={`inline-block px-2 py-0.5 rounded text-sm font-bold ${CONFIANZA_COLOR[data.confianza]}`}>
              {data.confianza}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {data.totalPedidosObservados} pedidos, {data.totalSemanasObservadas} semanas
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Pedidos / semana</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">
            {data.pedidosPorSemana.toFixed(1)}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Facturación / semana</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">
            <MoneyDisplay value={data.montoPorSemana} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Por día de la semana</h2>
        <div className="space-y-2">
          {data.porDia.map(d => {
            const widthPct = (d.promedioMonto / maxMonto) * 100
            const pedidosPct = (d.promedioPedidos / maxPedidos) * 100
            return (
              <div key={d.diaSemana} className="grid grid-cols-12 gap-2 items-center text-sm" data-testid={`forecast-dia-${d.diaSemana}`}>
                <div className="col-span-2 font-medium text-gray-700">{d.nombre}</div>
                <div className="col-span-6">
                  <div className="relative h-6 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600"
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white mix-blend-difference">
                      <MoneyDisplay value={d.promedioMonto} />
                    </div>
                  </div>
                </div>
                <div className="col-span-2 text-right text-gray-600">
                  <div className="font-medium text-gray-800">
                    {d.promedioPedidos.toFixed(1)} ped
                  </div>
                  <div className="text-[10px] text-gray-400">
                    ±{Math.round(d.desvMonto).toLocaleString()} CV:{d.coefVariacion.toFixed(2)}
                  </div>
                </div>
                <div className="col-span-2 text-right text-xs">
                  <div
                    className="h-3 bg-emerald-400 rounded ml-auto"
                    style={{ width: `${Math.min(100, pedidosPct)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="text-xs text-gray-400 text-center">
        Generado {new Date(data.generadoEn).toLocaleString('es-CO')}
      </div>
    </div>
  )
}
