'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { TimelineEvent, TimelineFilter } from './types'

const FILTROS: { key: TimelineFilter; label: string }[] = [
  { key: 'TODOS', label: 'Todo' },
  { key: 'PEDIDO', label: 'Pedidos' },
  { key: 'PAGO', label: 'Pagos' },
  { key: 'FACTURA', label: 'Facturas' },
  { key: 'ABONO', label: 'Abonos' },
  { key: 'CASO', label: 'Casos' },
  { key: 'NOTA_CREDITO', label: 'Notas crédito' },
  { key: 'AUDITORIA', label: 'Auditoría' },
]

const TIPO_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  PEDIDO: { color: 'text-blue-600', bg: 'bg-blue-500', icon: '📦' },
  PAGO: { color: 'text-green-600', bg: 'bg-green-500', icon: '💵' },
  FACTURA: { color: 'text-purple-600', bg: 'bg-purple-500', icon: '📄' },
  ABONO: { color: 'text-emerald-600', bg: 'bg-emerald-500', icon: '🏦' },
  CASO: { color: 'text-red-600', bg: 'bg-red-500', icon: '🛡️' },
  NOTA_CREDITO: { color: 'text-orange-600', bg: 'bg-orange-500', icon: '📝' },
  AUDITORIA: { color: 'text-gray-600', bg: 'bg-gray-400', icon: '⚙️' },
}

interface ClienteHistorialProps {
  clienteId: string
}

export function ClienteHistorial({ clienteId }: ClienteHistorialProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [filtro, setFiltro] = useState<TimelineFilter>('TODOS')
  const [meses, setMeses] = useState<string>('12')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')

  const fetchEvents = useCallback(async (nextPage = 1, append = false) => {
    setLoading(true)
    setError('')
    try {
      const url = `/api/clientes/${clienteId}/historial?meses=${meses}&page=${nextPage}&pageSize=20`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setEvents(prev => append ? [...prev, ...data.events] : data.events)
        setHasMore(data.hasMore)
        setPage(nextPage)
      } else {
        setError(data.error?.message || 'Error cargando historial')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [clienteId, meses])

  useEffect(() => {
    fetchEvents(1, false)
  }, [fetchEvents])

  const filtrados = filtro === 'TODOS'
    ? events
    : events.filter(e => e.tipo === filtro)

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filtro === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <select
          value={meses}
          onChange={(e) => setMeses(e.target.value)}
          className="ml-auto px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="12">Últimos 12 meses</option>
          <option value="6">Últimos 6 meses</option>
          <option value="3">Últimos 3 meses</option>
          <option value="todo">Todo el historial</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Timeline */}
      {loading && events.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="font-medium">Sin eventos en el período seleccionado</p>
          <p className="text-sm text-gray-400 mt-1">Intenta con otro filtro o rango de fechas</p>
        </div>
      ) : (
        <div className="space-y-0">
          {filtrados.map((evt) => {
            const cfg = TIPO_CONFIG[evt.tipo] || TIPO_CONFIG.AUDITORIA
            return (
              <div key={evt.id} className="flex gap-3 py-3 border-b last:border-b-0">
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${cfg.bg}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm">{cfg.icon}</span>
                    <span className="font-medium text-gray-800 text-sm">{evt.titulo}</span>
                    {evt.numero !== undefined && (
                      <span className="text-xs text-gray-400">#{evt.numero}</span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatDate(evt.fecha)}
                    </span>
                  </div>
                  {evt.descripcion && (
                    <p className="text-sm text-gray-600 mt-0.5">{evt.descripcion}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {evt.monto !== undefined && (
                      <span className={`text-sm font-semibold ${cfg.color}`}>
                        {formatCurrency(evt.monto)}
                      </span>
                    )}
                    {evt.estado && (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        {evt.estado}
                      </span>
                    )}
                    {evt.metodo && (
                      <span className="text-xs text-gray-500">{evt.metodo}</span>
                    )}
                    {evt.link && (
                      <Link
                        href={evt.link}
                        className="text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ver →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginación */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => fetchEvents(page + 1, true)}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Cargando...' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  )
}
