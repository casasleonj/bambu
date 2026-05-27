'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SkeletonPage } from '@/components/skeleton'
import { Tooltip, InfoBanner } from '@/components/tooltip'
import { DateRangeFilter } from '@/components/date-range-filter'
import type { Embarque, Trabajador, Ruta, Pedido } from './types'
import { EmbarqueCard } from './embarque-card'
import { EmbarqueCreateModal } from './embarque-create-modal'
import { EmbarqueDetailModal } from './embarque-detail-modal'

interface InitialData {
  embarques: Embarque[]
  trabajadores: Trabajador[]
  rutas: Ruta[]
  pedidos: Pedido[]
}

export default function EmbarquesClient({ initialData }: { initialData?: InitialData }) {
  const [embarques, setEmbarques] = useState<Embarque[]>(initialData?.embarques || [])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>(initialData?.trabajadores || [])
  const [rutas, setRutas] = useState<Ruta[]>(initialData?.rutas || [])
  const [pedidos, setPedidos] = useState<Pedido[]>(initialData?.pedidos || [])
  const [loading, setLoading] = useState(!initialData)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEmbarque, setSelectedEmbarque] = useState<Embarque | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })
  const [filtroEstado, setFiltroEstado] = useState('')
  const [stockEstimado, setStockEstimado] = useState<{ agua: number; hielo: number } | null>(null)
  const [mostrarFormEstimado, setMostrarFormEstimado] = useState(false)
  const [estimadoAgua, setEstimadoAgua] = useState(0)
  const [estimadoHielo, setEstimadoHielo] = useState(0)
  const [guardandoEstimado, setGuardandoEstimado] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [stockBajo, setStockBajo] = useState(false)
  const { confirm, modal } = useConfirm()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setFetchError(null)
      const params = new URLSearchParams()
      if (dateRange.desde && dateRange.hasta) {
        params.set('desde', dateRange.desde)
        params.set('hasta', dateRange.hasta)
      }
      if (filtroEstado) params.set('estado', filtroEstado)
      const [embarquesRes, trabajadoresRes, rutasRes, pedidosRes] = await Promise.all([
        fetch(`/api/embarques?${params.toString()}`, { credentials: 'include' }),
        fetch('/api/trabajadores?rol=REPARTIDOR&activo=true', { credentials: 'include' }),
        fetch('/api/rutas?all=true', { credentials: 'include' }),
        fetch('/api/pedidos?all=true', { credentials: 'include' }),
      ])

      const embarquesJson = await embarquesRes.json()
      const trabajadoresJson = await trabajadoresRes.json()
      const rutasJson = await rutasRes.json()
      const pedidosData = await pedidosRes.json()
      const stockJson = await fetch('/api/stock-estimado', { credentials: 'include' }).then(r => r.json())
      const stockData = await fetch('/api/embarques?all=true&stock=true', { credentials: 'include' }).then(r => r.json())

      setEmbarques(embarquesJson.embarques || embarquesJson.data || [])
      setTrabajadores(trabajadoresJson.trabajadores || [])
      setRutas(rutasJson.rutas || [])
      setPedidos(pedidosData.pedidos || pedidosData.data || [])
      if (stockJson.data?.estimado) {
        setStockEstimado(stockJson.data.estimado)
        setBannerDismissed(false)
      }
      if (stockData.stock) {
        const totalStock = (stockData.stock.PACA_AGUA || 0) + (stockData.stock.PACA_HIELO || 0)
        setStockBajo(totalStock < 50)
      }
    } catch {
      setFetchError('No se pudieron cargar los embarques')
      toast.error('Error cargando embarques')
    } finally {
      setLoading(false)
    }
  }, [dateRange, filtroEstado])

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
  }, [embarques, showDetailModal, selectedEmbarque])

  const handleEmbarqueUpdated = (updatedEmbarque: Embarque) => {
    setSelectedEmbarque(updatedEmbarque)
    setEmbarques(prev => prev.map(e => e.id === updatedEmbarque.id ? updatedEmbarque : e))
  }

  const getEstadoBadge = (estado: string) => {
    const styles: Record<string, string> = {
      ABIERTO: 'bg-green-100 text-green-800',
      EN_RUTA: 'bg-blue-100 text-blue-800',
      CERRADO: 'bg-gray-100 text-gray-800',
      CANCELADO: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[estado] || ''}`}>
        {estado === 'EN_RUTA' ? 'En Ruta' : estado}
      </span>
    )
  }

  const handleAutoGenerate = async () => {
    const ok = await confirm({
      title: 'Generar embarques automáticos',
      message: '¿Crear embarques automáticos para todos los pedidos pendientes?',
      description: 'El sistema agrupará los pedidos pendientes por zona y creará embarques optimizados.',
      consequences: [
        'Se crearán nuevos embarques si hay pedidos pendientes',
        'Los pedidos se asignarán automáticamente a rutas',
        'No afectará pedidos ya en embarques existentes',
      ],
      variant: 'warning',
      confirmLabel: 'Sí, generar',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    try {
      const res = await fetch('/api/embarques/auto', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message)
        fetchData()
      } else {
        toast.error(data.error?.message || 'Error al generar embarques')
      }
    } catch {
      toast.error('Error de conexión al generar embarques')
    }
  }

  const handleDateChange = useCallback((desde: string | null, hasta: string | null) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDateRange({ desde, hasta })
    }, 300)
  }, [])

  if (fetchError) {
    return (
      <ErrorState
        title="No se pudieron cargar los embarques"
        message={fetchError}
        errorCode="FETCH_EMBARQUES_ERROR"
        onRetry={() => { setLoading(true); fetchData(); }}
      />
    )
  }

  if (loading) {
    return <SkeletonPage hasStats={false} hasFilters cardCount={3} />
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Embarques del Día</h1>
        <div className="flex gap-2">
          <Tooltip content="Agrupa automáticamente los pedidos pendientes en embarques optimizados por zona" title="Auto-Generar" position="bottom">
            <button
              onClick={handleAutoGenerate}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              Auto-Generar
            </button>
          </Tooltip>
          <Tooltip content="Crea un embarque manual seleccionando repartidor y ruta" title="Nuevo Embarque" position="bottom">
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              + Nuevo Embarque
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow mb-4">
        <DateRangeFilter onDateChange={handleDateChange} />
        <div className="flex gap-2 mt-3">
          {[
            { key: '', label: 'Todos' },
            { key: 'ABIERTO', label: 'Abiertos' },
            { key: 'EN_RUTA', label: 'En Ruta' },
            { key: 'CERRADO', label: 'Cerrados' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFiltroEstado(key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                filtroEstado === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!bannerDismissed && (stockEstimado || stockBajo) && (stockEstimado ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Stock estimado activo</p>
                <p className="text-xs text-amber-700">
                  Agua: {stockEstimado.agua} pacas · Hielo: {stockEstimado.hielo} pacas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setMostrarFormEstimado(true); setEstimadoAgua(stockEstimado.agua); setEstimadoHielo(stockEstimado.hielo) }}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium"
              >
                Editar
              </button>
              <button
                onClick={async () => {
                  await fetch('/api/stock-estimado', { method: 'DELETE', credentials: 'include' })
                  setStockEstimado(null)
                  toast.success('Stock estimado eliminado')
                }}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Eliminar
              </button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          </div>
          {mostrarFormEstimado && (
            <div className="mt-3 pt-3 border-t border-amber-200 grid grid-cols-3 gap-2 items-end">
              <div>
                <label className="text-xs text-amber-800">Pacas Agua</label>
                <input
                  type="number"
                  min={0}
                  value={estimadoAgua}
                  onChange={(e) => setEstimadoAgua(parseInt(e.target.value) || 0)}
                  className="w-full px-2 py-1 border border-amber-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-amber-800">Pacas Hielo</label>
                <input
                  type="number"
                  min={0}
                  value={estimadoHielo}
                  onChange={(e) => setEstimadoHielo(parseInt(e.target.value) || 0)}
                  className="w-full px-2 py-1 border border-amber-300 rounded text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setGuardandoEstimado(true)
                    await fetch('/api/stock-estimado', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ agua: estimadoAgua, hielo: estimadoHielo }),
                    })
                    setStockEstimado({ agua: estimadoAgua, hielo: estimadoHielo })
                    setMostrarFormEstimado(false)
                    setGuardandoEstimado(false)
                    toast.success('Stock estimado actualizado')
                  }}
                  disabled={guardandoEstimado}
                  className="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setMostrarFormEstimado(false)}
                  className="px-3 py-1 border rounded text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Stock registrado bajo</p>
                <p className="text-xs text-amber-700">¿Cuántas pacas hay físicamente en zona de embarque?</p>
              </div>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 items-end">
            <div>
              <label className="text-xs text-amber-700">Pacas Agua</label>
              <input
                type="number"
                min={0}
                value={estimadoAgua}
                onChange={(e) => setEstimadoAgua(parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1 border border-amber-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-amber-700">Pacas Hielo</label>
              <input
                type="number"
                min={0}
                value={estimadoHielo}
                onChange={(e) => setEstimadoHielo(parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1 border border-amber-300 rounded text-sm"
              />
            </div>
            <button
              onClick={async () => {
                setGuardandoEstimado(true)
                await fetch('/api/stock-estimado', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ agua: estimadoAgua, hielo: estimadoHielo }),
                })
                setStockEstimado({ agua: estimadoAgua, hielo: estimadoHielo })
                setGuardandoEstimado(false)
                toast.success('Stock estimado guardado')
              }}
              disabled={guardandoEstimado}
              className="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      ))}

      <InfoBanner type="info" className="mb-4">
        <p><strong>Capacidad máxima:</strong> 70 pacas por embarque. Los colores indican el nivel de carga:</p>
        <div className="flex flex-wrap gap-3 mt-2">
          <span className="text-xs">🟢 ≤75% Ideal</span>
          <span className="text-xs">🟡 75-87% Pesado</span>
          <span className="text-xs">🔴 87-100% Máximo</span>
          <span className="text-xs">⛔ {'>'}100% Excedido</span>
        </div>
      </InfoBanner>

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
              description="Los embarques agrupan pedidos por zona para optimizar las rutas de entrega"
              actionLabel="+ Crear Embarque"
              onAction={() => setShowModal(true)}
              guidedSteps={[
                { label: 'Crear un embarque', description: 'Selecciona repartidor y ruta', onClick: () => setShowModal(true) },
                { label: 'Asignar pedidos', description: 'Los pedidos pendientes se muestran automáticamente' },
                { label: 'Enviar repartidor', description: 'El repartidor recibe la ruta en su app' },
                { label: 'Cerrar embarque', description: 'Registra las entregas y cobros al finalizar' },
              ]}
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
