'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import { DateRangeFilter } from '@/components/date-range-filter'
import type { Embarque, Trabajador, Ruta, Pedido } from './types'
import { EmbarqueCard } from './embarque-card'
import { EmbarqueCreateModal } from './embarque-create-modal'
import { EmbarqueDetailModal } from './embarque-detail-modal'

export default function EmbarquesClient() {
  const [embarques, setEmbarques] = useState<Embarque[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEmbarque, setSelectedEmbarque] = useState<Embarque | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })
  const { confirm, modal } = useConfirm()

  const fetchData = useCallback(async () => {
    try {
      setFetchError(null)
      const params = new URLSearchParams()
      if (dateRange.desde && dateRange.hasta) {
        params.set('desde', dateRange.desde)
        params.set('hasta', dateRange.hasta)
      }
      const [embarquesRes, trabajadoresRes, rutasRes] = await Promise.all([
        fetch(`/api/embarques?${params.toString()}`),
        fetch('/api/trabajadores?rol=REPARTIDOR&activo=true'),
        fetch('/api/rutas?all=true'),
      ])
      const pedidosData = await fetch('/api/pedidos?all=true').then((r) => r.json())

      const embarquesJson = await embarquesRes.json()
      const trabajadoresJson = await trabajadoresRes.json()
      const rutasJson = await rutasRes.json()

      setEmbarques(embarquesJson.embarques || embarquesJson.data || [])
      setTrabajadores(trabajadoresJson.trabajadores || [])
      setRutas(rutasJson.rutas || [])
      setPedidos(pedidosData.pedidos || pedidosData.data || [])
    } catch {
      setFetchError('No se pudieron cargar los embarques')
      toast.error('Error cargando embarques')
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (showDetailModal && selectedEmbarque) {
      const updated = embarques.find(e => e.id === selectedEmbarque.id)
      if (updated && updated !== selectedEmbarque) {
        setSelectedEmbarque(updated)
      }
    }
  }, [embarques])

  const handleEmbarqueUpdated = (updatedEmbarque: Embarque) => {
    setSelectedEmbarque(updatedEmbarque)
    setEmbarques(prev => prev.map(e => e.id === updatedEmbarque.id ? updatedEmbarque : e))
  }

  const getEstadoBadge = (estado: string) => {
    const styles: Record<string, string> = {
      ABIERTO: 'bg-green-100 text-green-800',
      CERRADO: 'bg-gray-100 text-gray-800',
      CANCELADO: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[estado] || ''}`}>
        {estado}
      </span>
    )
  }

  const handleAutoGenerate = async () => {
    const ok = await confirm('¿Generar embarques automáticos para todos los pedidos pendientes?')
    if (!ok) return
    try {
      const res = await fetch('/api/embarques/auto', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message)
        fetchData()
      } else {
        toast.error(data.error?.message || 'Error')
      }
    } catch {
      toast.error('Error al generar embarques')
    }
  }

  const handleDateChange = useCallback((desde: string | null, hasta: string | null) => {
    setDateRange({ desde, hasta })
  }, [])

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900">{fetchError}</h3>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Embarques del Día</h1>
        <div className="flex gap-2">
          <button
            onClick={handleAutoGenerate}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Auto-Generar
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            + Nuevo Embarque
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow mb-4">
        <DateRangeFilter onDateChange={handleDateChange} />
      </div>

      <div className="flex gap-4 mb-4 text-xs text-gray-600">
        <span>🟢 ≤75% Ideal</span>
        <span>🟡 75-87% Pesado</span>
        <span>🔴 87-100% Máximo</span>
        <span>⛔ {'>'}100% Excedido</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {embarques.map((embarque) => (
          <EmbarqueCard
            key={embarque.id}
            embarque={embarque}
            getEstadoBadge={getEstadoBadge}
            onClick={() => {
              setSelectedEmbarque(embarque)
              setShowDetailModal(true)
            }}
          />
        ))}
        {embarques.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m0 0a2 2 0 104 0m0 0a2 2 0 104 0" /></svg>}
              title="No hay embarques hoy"
              description="Crea tu primer embarque para comenzar"
              actionLabel="+ Crear Embarque"
              onAction={() => setShowModal(true)}
            />
          </div>
        )}
      </div>

      <EmbarqueCreateModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchData}
        trabajadores={trabajadores}
        rutas={rutas}
      />

      <EmbarqueDetailModal
        open={showDetailModal && !!selectedEmbarque}
        onClose={() => setShowDetailModal(false)}
        embarque={selectedEmbarque}
        pedidos={pedidos}
        embarques={embarques}
        getEstadoBadge={getEstadoBadge}
        onChanged={fetchData}
        onEmbarqueUpdated={handleEmbarqueUpdated}
      />
      {modal}
    </div>
  )
}
