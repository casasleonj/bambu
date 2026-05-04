'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { EmptyState } from '@/components/empty-state'
import { DateRangeFilter } from '@/components/date-range-filter'
import { getCapacidadInfo } from '@/lib/embarque-capacidad'

interface Ruta {
  id: string
  nombre: string
  repartidorId?: string | null
}

interface Trabajador {
  id: string
  nombre: string
}

interface Pedido {
  id: string
  numero: number
  cliente?: { nombre: string; barrio: string | null }
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
}

interface Embarque {
  id: string
  numero: number
  fecha: string
  horaSalida: string | null
  estado: string
  obs: string | null
  trabajador: {
    id: string
    nombre: string
  }
  ruta?: Ruta | null
  pedidos: Pedido[]
  totalPacas?: number
  pesoKg?: number
  capacidadKg?: number
  capacidadInfo?: {
    nivel: string
    label: string
    color: string
    icon: string
    porcentaje: number
    total: number
    pesoKg: number
    capacidadKg: number
  }
}

export default function EmbarquesPage() {
  const router = useRouter()
  const [embarques, setEmbarques] = useState<Embarque[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEmbarque, setSelectedEmbarque] = useState<Embarque | null>(null)
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([])
  const [selectedTrabajadorId, setSelectedTrabajadorId] = useState('')
  const [selectedRutaId, setSelectedRutaId] = useState('')
  const [obs, setObs] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
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
    } catch (error) {
      console.error('Error fetching data:', error)
      setFetchError('No se pudieron cargar los embarques')
      toast.error('Error cargando embarques')
    } finally {
      setLoading(false)
    }
  }

  const [submitting, setSubmitting] = useState(false)

  async function createEmbarque() {
    if (!selectedTrabajadorId || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/embarques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trabajadorId: selectedTrabajadorId,
          rutaId: selectedRutaId || undefined,
          obs,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setSelectedTrabajadorId('')
        setSelectedRutaId('')
        setObs('')
        fetchData()
        toast.success('Embarque creado')
      } else {
        toast.error(data.error || 'Error creando embarque')
      }
    } catch (error) {
      console.error('Error creating embarque:', error)
      toast.error('Error creando embarque')
    } finally {
      setSubmitting(false)
    }
  }

  async function assignPedidos() {
    if (!selectedEmbarque || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/embarques/${selectedEmbarque.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obs: selectedEmbarque.obs,
          estado: selectedEmbarque.estado,
          pedidoIds: selectedPedidoIds,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setShowDetailModal(false)
        fetchData()
        toast.success('Pedidos asignados')
      } else {
        toast.error(data.error || 'Error asignando pedidos')
      }
    } catch (error) {
      console.error('Error assigning pedidos:', error)
      toast.error('Error asignando pedidos')
    } finally {
      setSubmitting(false)
    }
  }

  async function eliminarPedido(pedidoId: string) {
    if (!selectedEmbarque) return
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embarqueId: null }),
      })
      const data = await res.json()
      if (data.success) {
        setSelectedPedidoIds((prev) => prev.filter((id) => id !== pedidoId))
        fetchData()
        toast.success('Pedido removido')
      } else {
        toast.error('Error removiendo pedido')
      }
    } catch (error) {
      console.error('Error removing pedido:', error)
      toast.error('Error removiendo pedido')
    }
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

  const disponiblesParaAsignar = pedidos.filter(
    (p) => !embarques.some((e) => e.pedidos?.some((ep) => ep.id === p.id))
  )

  // Calculate capacity for selected embarque + new selections
  function calcularCapacidadProyectada(embarque: Embarque, nuevosPedidoIds: string[]): { totalPacas: number; pesoKg: number } {
    const pacasActuales = embarque.totalPacas || 0
    const pesoActual = embarque.pesoKg || 0
    const nuevosPedidos = pedidos.filter((p) => nuevosPedidoIds.includes(p.id))
    const pacasNuevas = nuevosPedidos.reduce(
      (sum, p) => sum + (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) + (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) + (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0), 0
    )
    const pesoNuevo = nuevosPedidos.reduce(
      (sum, p) =>
        sum +
        (p.cPacaAguaPed || 0) * 10.0 +
        (p.cPacaHieloPed || 0) * 11.0 +
        (p.cBotellonFabPed || 0) * 20.0 +
        (p.cBotellonDomPed || 0) * 20.0 +
        (p.cBolsaAguaPed || 0) * 0.25 +
        (p.cBolsaHieloPed || 0) * 0.55,
      0
    )
    return { totalPacas: pacasActuales + pacasNuevas, pesoKg: pesoActual + pesoNuevo }
  }

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
            onClick={async () => {
              if (!confirm('¿Generar embarques automáticos para todos los pedidos pendientes?')) return
              try {
                const res = await fetch('/api/embarques/auto', { method: 'POST' })
                const data = await res.json()
                if (data.success) {
                  toast.success(data.message)
                  fetchData()
                } else {
                  toast.error(data.error || 'Error')
                }
              } catch (e) {
                toast.error('Error al generar embarques')
              }
            }}
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

      {/* Filtro por fecha */}
      <div className="bg-white p-4 rounded-xl shadow mb-4">
        <DateRangeFilter onDateChange={(desde, hasta) => { setDateRange({ desde, hasta }); setTimeout(fetchData, 0) }} />
      </div>

      {/* Leyenda de capacidad */}
      <div className="flex gap-4 mb-4 text-xs text-gray-600">
        <span>🟢 ≤75% Ideal</span>
        <span>🟡 75-87% Pesado</span>
        <span>🔴 87-100% Máximo</span>
        <span>⛔ {'>'}100% Excedido</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {embarques.map((embarque) => {
          const cap = embarque.capacidadInfo || getCapacidadInfo(embarque.totalPacas || 0, embarque.pesoKg || 0, embarque.capacidadKg || 500)
          return (
            <div
              key={embarque.id}
              className="bg-white p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer border"
              onClick={() => {
                setSelectedEmbarque(embarque)
                setSelectedPedidoIds([])
                setShowDetailModal(true)
              }}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-lg font-bold text-gray-800">#{embarque.numero}</p>
                  <p className="text-sm text-gray-500">{embarque.trabajador.nombre}</p>
                  {embarque.ruta && (
                    <p className="text-xs text-blue-600 font-medium">{embarque.ruta.nombre}</p>
                  )}
                </div>
                {getEstadoBadge(embarque.estado)}
              </div>

              {/* Capacidad */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-3 ${cap.color}`}>
                <span className="text-lg">{cap.icon}</span>
                <div>
                  <p className="text-sm font-medium">{cap.label}</p>
                  <p className="text-xs">{cap.total} pacas · {cap.pesoKg.toFixed(1)}kg / {cap.capacidadKg}kg</p>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                <p>{embarque.pedidos?.length || 0} pedidos asignados</p>
                {embarque.horaSalida && (
                  <p>Salida: {new Date(embarque.horaSalida).toLocaleTimeString()}</p>
                )}
              </div>
              {embarque.obs && (
                <p className="mt-2 text-xs text-gray-500 truncate">{embarque.obs}</p>
              )}
            </div>
          )
        })}
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

      {/* Modal Crear */}
      <Modal open={showModal} onClose={() => setShowModal(false)} className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Nuevo Embarque</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Repartidor
            </label>
            <select
              value={selectedTrabajadorId}
              onChange={(e) => {
                setSelectedTrabajadorId(e.target.value)
                // Auto-suggest route based on repartidor
                const repartidorRuta = rutas.find(r => r.repartidorId === e.target.value)
                if (repartidorRuta) {
                  setSelectedRutaId(repartidorRuta.id)
                }
              }}
              className="w-full p-2 border rounded-lg"
            >
              <option value="">Seleccionar...</option>
              {trabajadores.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ruta (opcional)
            </label>
            <select
              value={selectedRutaId}
              onChange={(e) => setSelectedRutaId(e.target.value)}
              className="w-full p-2 border rounded-lg"
            >
              <option value="">Sin ruta</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
            {selectedTrabajadorId && !selectedRutaId && (
              <p className="text-xs text-yellow-600 mt-1">
                Sin ruta asignada. Los pedidos no se agruparán por territorio.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="w-full p-2 border rounded-lg"
              rows={3}
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setShowModal(false)}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={createEmbarque}
            disabled={!selectedTrabajadorId || submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </Modal>

      {/* Modal Detalle */}
      <Modal open={showDetailModal && !!selectedEmbarque} onClose={() => setShowDetailModal(false)} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {selectedEmbarque && (
          <>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Embarque #{selectedEmbarque.numero}</h2>
                <p className="text-gray-500">{selectedEmbarque.trabajador.nombre}</p>
                {selectedEmbarque.ruta && (
                  <p className="text-sm text-blue-600">{selectedEmbarque.ruta.nombre}</p>
                )}
              </div>
              {getEstadoBadge(selectedEmbarque.estado)}
            </div>

            {/* Capacidad actual */}
            {(() => {
              const capacidadKg = selectedEmbarque.capacidadKg || 500
              const capacidadActual = getCapacidadInfo(
                selectedEmbarque.totalPacas || 0,
                selectedEmbarque.pesoKg || 0,
                capacidadKg
              )
              const proyectada = calcularCapacidadProyectada(selectedEmbarque, selectedPedidoIds)
              const capacidadProyectada = getCapacidadInfo(proyectada.totalPacas, proyectada.pesoKg, capacidadKg)
              return (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-4 ${capacidadActual.color}`}>
                  <span className="text-lg">{capacidadActual.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {capacidadActual.label}: {capacidadActual.pesoKg.toFixed(1)}kg / {capacidadKg}kg ({capacidadActual.porcentaje.toFixed(0)}%)
                      {selectedPedidoIds.length > 0 && (
                        <span className="text-gray-600">
                          {' '}→ {capacidadProyectada.pesoKg.toFixed(1)}kg ({capacidadProyectada.label})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )
            })()}

            {selectedEmbarque.estado === 'ABIERTO' && (
              <>
                <div className="mb-4">
                  <h3 className="font-medium text-gray-700 mb-2">Agregar Pedidos</h3>
                  <div className="max-h-40 overflow-y-auto border rounded-lg">
                    {disponiblesParaAsignar.map((pedido) => (
                      <label
                        key={pedido.id}
                        className="flex items-center p-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPedidoIds.includes(pedido.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPedidoIds((prev) => [...prev, pedido.id])
                            } else {
                              setSelectedPedidoIds((prev) =>
                                prev.filter((id) => id !== pedido.id)
                              )
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">
                          #{pedido.numero} - {pedido.cliente?.nombre || 'Sin cliente'} ({pedido.cliente?.barrio || 'Sin zona'})
                          <span className="text-gray-500 ml-1">
                            {(pedido.cPacaAguaPed || 0) + (pedido.cPacaHieloPed || 0) + (pedido.cBotellonFabPed || 0) + (pedido.cBotellonDomPed || 0) + (pedido.cBolsaAguaPed || 0) + (pedido.cBolsaHieloPed || 0)} pacas
                          </span>
                        </span>
                      </label>
                    ))}
                    {disponiblesParaAsignar.length === 0 && (
                      <p className="p-2 text-gray-500 text-sm">
                        No hay pedidos disponibles
                      </p>
                    )}
                  </div>
                  {(() => {
                    const proyectada = calcularCapacidadProyectada(selectedEmbarque, selectedPedidoIds)
                    const capacidadKg = selectedEmbarque.capacidadKg || 500
                    if (proyectada.pesoKg > capacidadKg) {
                      return (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ Excederá capacidad máxima ({capacidadKg}kg)
                        </p>
                      )
                    }
                    return null
                  })()}
                </div>

                <button
                  onClick={assignPedidos}
                  disabled={selectedPedidoIds.length === 0 || submitting}
                  className="w-full mb-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Asignando...' : 'Asignar Pedidos'}
                </button>
              </>
            )}

            <div className="mb-4">
              <h3 className="font-medium text-gray-700 mb-2">Pedidos Asignados</h3>
              <div className="border rounded-lg divide-y">
                {selectedEmbarque.pedidos?.map((pedido) => (
                  <div
                    key={pedido.id}
                    className="flex justify-between items-center p-2"
                  >
                    <span className="text-sm">
                      #{pedido.numero} - {pedido.cliente?.nombre || 'Sin cliente'} ({pedido.cliente?.barrio || 'Sin zona'})
                      <span className="block text-xs text-gray-500">
                        {pedido.cPacaAguaPed > 0 && `🍶 ${pedido.cPacaAguaPed} `}
                        {pedido.cPacaHieloPed > 0 && `🧊 ${pedido.cPacaHieloPed} `}
                        {pedido.cBotellonFabPed > 0 && `🏭 ${pedido.cBotellonFabPed} `}
                        {pedido.cBotellonDomPed > 0 && `🏠 ${pedido.cBotellonDomPed} `}
                        {pedido.cBolsaAguaPed > 0 && `💧 ${pedido.cBolsaAguaPed} `}
                        {pedido.cBolsaHieloPed > 0 && `❄️ ${pedido.cBolsaHieloPed} `}
                      </span>
                    </span>
                    {selectedEmbarque.estado === 'ABIERTO' && (
                      <button
                        onClick={() => eliminarPedido(pedido.id)}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
                {(!selectedEmbarque.pedidos ||
                  selectedEmbarque.pedidos.length === 0) && (
                  <p className="p-2 text-gray-500 text-sm">
                    Sin pedidos asignados
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              {selectedEmbarque.estado === 'ABIERTO' && (
                <>
                  <button
                    onClick={async () => {
                      if (!confirm('¿Cancelar este embarque? Los pedidos volverán a estar pendientes.')) return
                      if (submitting) return
                      setSubmitting(true)
                      try {
                        const res = await fetch(`/api/embarques/${selectedEmbarque.id}`, { method: 'DELETE' })
                        const data = await res.json()
                        if (data.success) {
                          toast.success('Embarque cancelado')
                          setShowDetailModal(false)
                          fetchData()
                        } else {
                          toast.error(data.error || 'Error')
                        }
                      } catch (e) {
                        toast.error('Error al cancelar')
                      } finally {
                        setSubmitting(false)
                      }
                    }}
                    disabled={submitting}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Cancelando...' : 'Cancelar'}
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailModal(false)
                      router.push(`/embarques/${selectedEmbarque.id}/cerrar`)
                    }}
                    disabled={submitting}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cerrar Embarque
                  </button>
                </>
              )}
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Volver
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
