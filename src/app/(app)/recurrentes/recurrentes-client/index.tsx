'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setFetchError(null)
    try {
      const [recRes, previewRes] = await Promise.all([
        fetch('/api/recurrentes', { signal: ctrl.signal }),
        fetch('/api/pedidos/recurrentes', { signal: ctrl.signal }),
      ])
      if (ctrl.signal.aborted) return
      const recData = await recRes.json()
      const previewData = await previewRes.json()

      if (recData.success) setRecurrentes(recData.recurrentes || [])
      if (previewData.success) {
        const p = previewData.preview || []
        setPreview(p)
        // Keep decisions only for current preview items
        const defaults: Record<string, string> = {}
        for (const item of p) {
          defaults[item.recurrenteId] = decisiones[item.recurrenteId] || 'NORMAL'
        }
        setDecisiones(defaults)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setFetchError('No se pudieron cargar los datos')
      toast.error('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    return () => { abortRef.current?.abort() }
  }, [fetchData])

  async function handleGenerar() {
    const decisionesArray = Object.entries(decisiones)
      .map(([recurrenteId, decision]) => ({ recurrenteId, decision }))
    if (decisionesArray.length === 0) { toast.error('No hay decisiones para generar'); return }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setGenerating(true)
    try {
      const res = await fetch('/api/pedidos/recurrentes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisiones: decisionesArray }),
        signal: ctrl.signal,
      })
      const data = await res.json()
      if (data.success) { toast.success(`${data.generados} generados, ${data.saltados} saltados`); fetchData() }
      else toast.error(data.error?.message || 'Error al generar')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Error de conexión')
    }
    finally { setGenerating(false) }
  }

  async function handleDelete(id: string) {
    const ok = await confirm('Eliminar esta plantilla recurrente?')
    if (!ok) return
    try {
      const res = await fetch(`/api/recurrentes?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) { toast.success('Plantilla eliminada'); fetchData() }
      else toast.error(data.error?.message || 'Error')
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
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-56 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-10 w-36 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
              <div className="flex justify-between">
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
              <div className="flex gap-2 pt-2">
                <div className="h-9 flex-1 bg-gray-200 rounded animate-pulse" />
                <div className="h-9 w-20 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">Pedidos Recurrentes</h1><p className="text-gray-600">{recurrentes.length} plantillas activas</p></div>
        <button onClick={() => router.push('/recurrentes/nuevo')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">+ Nueva Plantilla</button>
      </div>

      {preview.length > 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-yellow-800">Generación para hoy ({formatDate(new Date().toISOString())})</h2>
            <button onClick={handleGenerar} disabled={generating} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm">
              {generating ? 'Generando...' : 'Generar Todo'}
            </button>
          </div>
          <div className="space-y-3">
            {preview.map((item) => (
              <div key={item.recurrenteId} className="bg-white rounded-lg border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{item.clienteNombre}</span>
                    <span className="text-sm text-gray-500">cada {item.cadaNDias} días</span>
                    {item.clienteBloqueado && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">Bloqueado</span>}
                    {item.esDomingo && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-medium">Domingo → Lunes</span>}
                    {!item.cumpleMinimo && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">⚠ Menos de 3 productos</span>}
                    {item.horaPreferida && <span className="text-xs text-amber-600 font-medium inline-flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {item.horaPreferida}
                    </span>}
                    {item.pedidosPendientes.length > 0 && <span className="text-xs text-red-600">({item.pedidosPendientes.length} pendientes)</span>}
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
                    <div key={sug.tipo} className="flex flex-col">
                      <button
                        onClick={() => !sug.disabled && setDecisiones((prev) => ({ ...prev, [item.recurrenteId]: sug.tipo }))}
                        disabled={sug.disabled}
                        title={sug.disabledReason}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                          sug.disabled
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : decisiones[item.recurrenteId] === sug.tipo
                              ? sug.tipo === 'SALTAR' ? 'bg-gray-600 text-white' : 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {sug.label} <span className="block text-xs font-normal opacity-90">{sug.descripcion}</span>
                      </button>
                      {sug.disabled && sug.disabledReason && (
                        <span className="text-xs text-red-600 mt-0.5 px-1">{sug.disabledReason}</span>
                      )}
                    </div>
                  ))}
                </div>
                {item.saltos.length > 0 && <p className="text-xs text-gray-500 mt-2">Saltos programados: {item.saltos.join(', ')}</p>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-700 font-medium">Nada pendiente para hoy</p>
          <p className="text-sm text-green-600 mt-1">Los pedidos recurrentes se generarán automáticamente cuando lleguen sus fechas</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recurrentes.map((r) => (
          <div key={r.id} className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold">{r.cliente.nombre}</h3>
                <p className="text-sm text-gray-500">{r.cliente.telefono}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">cada {r.cadaNDias} días</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded uppercase font-medium">{r.tipo} · {r.canal}</span>
              </div>
            </div>
            <div className="text-sm text-gray-600 mb-2 flex flex-wrap gap-x-3">
              {r.productos?.PACA_AGUA > 0 && <span className="inline-flex items-center gap-1"><svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> P.Agua: {r.productos.PACA_AGUA}</span>}
              {r.productos?.PACA_HIELO > 0 && <span className="inline-flex items-center gap-1"><svg className="w-3 h-3 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> P.Hielo: {r.productos.PACA_HIELO}</span>}
              {r.productos?.BOTELLON > 0 && <span className="inline-flex items-center gap-1"><svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg> Bot: {r.productos.BOTELLON}</span>}
              {r.productos?.BOLSA_AGUA > 0 && <span className="inline-flex items-center gap-1"><svg className="w-3 h-3 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> B.Agua: {r.productos.BOLSA_AGUA}</span>}
              {r.productos?.BOLSA_HIELO > 0 && <span className="inline-flex items-center gap-1"><svg className="w-3 h-3 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> B.Hielo: {r.productos.BOLSA_HIELO}</span>}
            </div>
            <div className="text-xs text-gray-500 mb-3 space-y-0.5">
              {r.ultimaGeneracion ? <p>Última: {formatDate(r.ultimaGeneracion)}</p> : <p>Sin generar aún</p>}
              {r.proxGeneracion && <p>Próxima: {formatDate(r.proxGeneracion)}</p>}
              {r.horaPreferida && <p className="text-amber-600 font-medium inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {r.horaPreferida}
              </p>}
              {r.saltos.length > 0 && <p className="text-yellow-600 inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                Saltos: {r.saltos.length}
              </p>}
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
          title="No hay plantillas recurrentes"
          description="Crea plantillas de pedidos que se generen automaticamente"
          actionLabel="Crear la primera"
          onAction={() => router.push('/recurrentes/nuevo')}
        />
      )}
      {modal}
    </div>
  )
}
