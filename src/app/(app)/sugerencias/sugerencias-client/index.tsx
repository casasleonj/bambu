'use client'

/**
 * Sugerencias de llamadas outbound — Bloque 3 Cara A.
 *
 * Lista priorizada de clientes a contactar. El score es auto-computado
 * por el cron diario (POST /api/cron/recompute-scores). Si el cron no
 * ha corrido aún, la lista estará vacía — el botón "Recalcular ahora"
 * permite triggerearlo manualmente.
 */

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { MoneyDisplay } from '@/components/money-display'
import { formatLocalDate } from '@/lib/utils'

interface SugerenciaCliente {
  id: string
  nombre: string
  apellido: string | null
  telefono: string
  barrio: string | null
  diasAtraso: number
  scoreLlamada: number
  valorTipico: number | null
  intervaloMediano: number | null
  proxEsperada: string | null
  ultEntrega: string | null
  ultimaLlamada: string | null
}

export function SugerenciasClient() {
  const [clientes, setClientes] = useState<SugerenciaCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [recalculando, setRecalculando] = useState(false)
  const [top, setTop] = useState(30)

  const fetchSugerencias = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/sugerencias-llamadas?top=${top}`)
      const data = await r.json()
      if (data.success) {
        setClientes(data.clientes)
      } else {
        toast.error(data.error?.message || 'Error al cargar sugerencias')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setLoading(false)
    }
  }, [top])

  useEffect(() => {
    fetchSugerencias()
  }, [fetchSugerencias])

  const marcarContactado = async (id: string) => {
    try {
      const r = await fetch(`/api/clientes/${id}/marcar-contactado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await r.json()
      if (data.success) {
        toast.success('Marcado como contactado')
        fetchSugerencias()
      } else {
        toast.error(data.error?.message || 'Error')
      }
    } catch {
      toast.error('Error de red')
    }
  }

  const triggerRecompute = async () => {
    setRecalculando(true)
    try {
      const r = await fetch('/api/cron/recompute-scores', { method: 'POST' })
      const data = await r.json()
      if (data.success) {
        toast.success(`Recalculado: ${data.processed} clientes en ${(data.durationMs / 1000).toFixed(1)}s`)
        fetchSugerencias()
      } else {
        toast.error(data.error?.message || 'Error al recalcular')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setRecalculando(false)
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sugerencias de llamadas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Clientes con alta probabilidad de pedir agua. Score auto-computado por el cron diario.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerRecompute}
            disabled={recalculando}
            className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium hover:bg-indigo-100 transition disabled:opacity-50"
            data-testid="btn-recalcular-scores"
          >
            {recalculando ? '⏳ Recalculando…' : '🔄 Recalcular ahora'}
          </button>
          <select
            value={top}
            onChange={(e) => setTop(Number(e.target.value))}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
          >
            <option value={10}>Top 10</option>
            <option value={30}>Top 30</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Cargando…</div>
      ) : clientes.length === 0 ? (
        <div className="p-8 bg-white border border-gray-200 rounded-lg text-center">
          <p className="text-gray-600">No hay sugerencias en este momento.</p>
          <p className="text-xs text-gray-400 mt-2">
            Las sugerencias se generan cuando hay clientes con pedidos previos cuyo intervalo
            típico se venció. Si el cron nunca corrió, presioná &quot;Recalcular ahora&quot;.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="sugerencias-table">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Barrio</th>
                  <th className="px-3 py-2 text-right">Días atraso</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Valor típico</th>
                  <th className="px-3 py-2 text-right">Ciclo</th>
                  <th className="px-3 py-2 text-left">Última compra</th>
                  <th className="px-3 py-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">
                        {c.nombre} {c.apellido || ''}
                      </div>
                      <div className="text-xs text-gray-400">{c.telefono}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{c.barrio || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          c.diasAtraso > 7
                            ? 'bg-red-100 text-red-700'
                            : c.diasAtraso > 3
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-yellow-50 text-yellow-700'
                        }`}
                      >
                        {c.diasAtraso > 0 ? `+${c.diasAtraso}` : c.diasAtraso}d
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-800">
                      {c.scoreLlamada.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay value={c.valorTipico ?? 0} />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {c.intervaloMediano ? `cada ${c.intervaloMediano}d` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {c.ultEntrega ? formatLocalDate(c.ultEntrega) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <a
                        href={`tel:+57${c.telefono.replace(/\D/g, '')}`}
                        className="inline-block px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs font-medium hover:bg-emerald-100 transition mr-1"
                        data-testid={`btn-llamar-${c.id}`}
                      >
                        📞 Llamar
                      </a>
                      <button
                        onClick={() => marcarContactado(c.id)}
                        className="inline-block px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-medium hover:bg-blue-100 transition"
                        data-testid={`btn-contactado-${c.id}`}
                      >
                        ✓ Contactado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
