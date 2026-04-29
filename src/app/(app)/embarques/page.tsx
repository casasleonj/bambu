'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'

interface Trabajador {
  id: string
  nombre: string
}

interface Pedido {
  id: string
  numero: number
  nombreCli: string
  zonaCli: string
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
  pedidos: Pedido[]
}

export default function EmbarquesPage() {
  const [embarques, setEmbarques] = useState<Embarque[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEmbarque, setSelectedEmbarque] = useState<Embarque | null>(null)
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([])
  const [selectedTrabajadorId, setSelectedTrabajadorId] = useState('')
  const [obs, setObs] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [embarquesData, trabajadoresData] = await Promise.all([
        fetch('/api/embarques'),
        fetch('/api/trabajadores'),
      ])
      const pedidosData = await fetch('/api/pedidos?all=true').then((r) => r.json())

      const embarques = await embarquesData.json()
      const trabajadores = await trabajadoresData.json()

      setEmbarques(embarques.embarques || embarques.data || [])
      setTrabajadores(trabajadores.trabajadores || trabajadores.data || [])
      setPedidos(pedidosData.pedidos || pedidosData.data || [])
    } catch (error) {
      console.error('Error fetching data:', error)
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
          obs,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setSelectedTrabajadorId('')
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

  async function cerrarEmbarque() {
    if (!selectedEmbarque || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/embarques/${selectedEmbarque.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: 'CERRADO',
          horaLlegada: new Date().toISOString(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setShowDetailModal(false)
        fetchData()
        toast.success('Embarque cerrado')
      } else {
        toast.error(data.error || 'Error cerrando embarque')
      }
    } catch (error) {
      console.error('Error closing embarque:', error)
      toast.error('Error cerrando embarque')
    } finally {
      setSubmitting(false)
    }
  }

  async function eliminarPedido(pedidoId: string) {
    if (!selectedEmbarque) return
    const pedido = pedidos.find((p) => p.id === pedidoId)
    if (!pedido) return
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {embarques.map((embarque) => (
          <div
            key={embarque.id}
            className="bg-white p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer"
            onClick={() => {
              setSelectedEmbarque(embarque)
              setShowDetailModal(true)
            }}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-lg font-bold text-gray-800">#{embarque.numero}</p>
                <p className="text-sm text-gray-500">{embarque.trabajador.nombre}</p>
              </div>
              {getEstadoBadge(embarque.estado)}
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
        ))}
        {embarques.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            <p className="mb-2">No hay embarques hoy</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm"
            >
              + Crear tu primer embarque
            </button>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Nuevo Embarque</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Trabajador
            </label>
            <select
              value={selectedTrabajadorId}
              onChange={(e) => setSelectedTrabajadorId(e.target.value)}
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

      <Modal open={showDetailModal && !!selectedEmbarque} onClose={() => setShowDetailModal(false)} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {selectedEmbarque && (
          <>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Embarque #{selectedEmbarque.numero}</h2>
                <p className="text-gray-500">{selectedEmbarque.trabajador.nombre}</p>
              </div>
              {getEstadoBadge(selectedEmbarque.estado)}
            </div>

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
                        <span>
                          #{pedido.numero} - {pedido.nombreCli} ({pedido.zonaCli})
                        </span>
                      </label>
                    ))}
                    {disponiblesParaAsignar.length === 0 && (
                      <p className="p-2 text-gray-500 text-sm">
                        No hay pedidos disponibles
                      </p>
                    )}
                  </div>
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
                    <span>
                      #{pedido.numero} - {pedido.nombreCli} ({pedido.zonaCli})
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
                    onClick={cerrarEmbarque}
                    disabled={submitting}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Cerrando...' : 'Cerrar Embarque'}
                  </button>
                </>
              )}
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}