'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/empty-state'
import type { Recurrente, PreviewItem } from './types'

export default function RecurrentesClient() {
  const router = useRouter()
  const [recurrentes, setRecurrentes] = useState<Recurrente[]>([])
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [decisiones, setDecisiones] = useState<Record<string, string>>({})
  const { confirm, modal } = useConfirm()

  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const [recRes, previewRes] = await Promise.all([
        fetch('/api/recurrentes'),
        fetch('/api/pedidos/recurrentes'),
      ])
      const recData = await recRes.json()
      const previewData = await previewRes.json()

      if (recData.success) setRecurrentes(recData.recurrentes || [])
      if (previewData.success) {
        const p = previewData.preview || []
        setPreview(p)
        const defaults: Record<string, string> = {}
        for (const item of p) defaults[item.recurrenteId] = 'NORMAL'
        setDecisiones(defaults)
      }
    } catch {
      setFetchError('No se pudieron cargar los datos')
      toast.error('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  async function handleGenerar() {
    const decisionesArray = Object.entries(decisiones)
      .filter(([_, d]) => d)
      .map(([recurrenteId, decision]) => ({ recurrenteId, decision }))
    if (decisionesArray.length === 0) { toast.error('No hay decisiones para generar'); return }
    setGenerating(true)
    try {
      const res = await fetch('/api/pedidos/recurrentes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisiones: decisionesArray }),
      })
      const data = await res.json()
      if (data.success) { toast.success(`${data.generados} generados, ${data.saltados} saltados`); fetchData() }
      else toast.error(data.error || 'Error al generar')
    } catch { toast.error('Error de conexión') }
    finally { setGenerating(false) }
  }

  async function handleDelete(id: string) {
    const ok = await confirm('Eliminar este recurrente?')
    if (!ok) return
    try {
      const res = await fetch(`/api/recurrentes?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) { toast.success('Recurrente eliminado'); fetchData() }
      else toast.error(data.error || 'Error')
    } catch { toast.error('Error de conexión') }
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900">{fetchError}</h3>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Reintentar</button>
      </div>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Pedidos Recurrentes</h1><p className="text-gray-600">{recurrentes.length} patrones activos</p></div>
        <button onClick={() => router.push('/recurrentes/nuevo')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">+ Nuevo Recurrente</button>
      </div>

      {preview.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-yellow-800">Generacion para hoy ({formatDate(new Date().toISOString())})</h2>
            <button onClick={handleGenerar} disabled={generating} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm">
              {generating ? 'Generando...' : 'Generar Seleccionados'}
            </button>
          </div>
          <div className="space-y-3">
            {preview.map((item) => (
              <div key={item.recurrenteId} className="bg-white rounded-lg border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium">{item.clienteNombre}</span>
                    <span className="text-sm text-gray-500 ml-2">{item.frecuencia}</span>
                    {item.pedidosPendientes.length > 0 && <span className="text-xs text-red-600 ml-2">({item.pedidosPendientes.length} pendientes)</span>}
                  </div>
                </div>
                {item.pedidosPendientes.length > 0 && (
                  <div className="text-sm text-gray-600 mb-2 bg-red-50 p-2 rounded">
                    Pedidos pendientes:{' '}
                    {item.pedidosPendientes.map((p) => (
                      <span key={p.id} className="ml-2">#{p.numero} ({(p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) + (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) + (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0)} pacas)</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {item.sugerencias.map((sug) => (
                    <button key={sug.tipo}
                      onClick={() => setDecisiones((prev) => ({ ...prev, [item.recurrenteId]: sug.tipo }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        decisiones[item.recurrenteId] === sug.tipo
                          ? sug.tipo === 'SALTAR' ? 'bg-gray-600 text-white' : 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {sug.label}<span className="block text-xs font-normal opacity-90">{sug.descripcion}</span>
                    </button>
                  ))}
                </div>
                {item.saltarFechas.length > 0 && <p className="text-xs text-gray-500 mt-2">Saltos programados: {item.saltarFechas.join(', ')}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recurrentes.map((r) => (
          <div key={r.id} className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-start justify-between mb-2">
              <div><h3 className="font-semibold">{r.cliente.nombre}</h3><p className="text-sm text-gray-500">{r.cliente.telefono}</p></div>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-medium">{r.frecuencia}</span>
            </div>
            <div className="text-sm text-gray-600 mb-2">
              {r.cPacaAguaPed > 0 && <span className="mr-2">🍶 {r.cPacaAguaPed}</span>}
              {r.cPacaHieloPed > 0 && <span className="mr-2">🧊 {r.cPacaHieloPed}</span>}
              {r.cBotellonFabPed > 0 && <span className="mr-2">🏭 {r.cBotellonFabPed}</span>}
              {r.cBotellonDomPed > 0 && <span className="mr-2">🏠 {r.cBotellonDomPed}</span>}
              {r.cBolsaAguaPed > 0 && <span className="mr-2">💧 {r.cBolsaAguaPed}</span>}
              {r.cBolsaHieloPed > 0 && <span className="mr-2">❄️ {r.cBolsaHieloPed}</span>}
            </div>
            <div className="text-xs text-gray-500 mb-3">
              {r.ultimaGeneracion ? <p>Ultima generacion: {formatDate(r.ultimaGeneracion)}</p> : <p>Sin generar aun</p>}
              <p>{r._count.pedidoHijo} pedidos generados</p>
              {r.saltarFechas.length > 0 && <p className="text-yellow-600">Saltos: {r.saltarFechas.length}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => router.push(`/recurrentes/${r.id}`)} className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm">Editar</button>
              <button onClick={() => handleDelete(r.id)} className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded text-sm">Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {recurrentes.length === 0 && (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
          title="No hay pedidos recurrentes"
          description="Crea templates de pedidos que se generen automaticamente"
          actionLabel="Crear el primero"
          onAction={() => router.push('/recurrentes/nuevo')}
        />
      )}
      {modal}
    </div>
  )
}
