'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { Modal } from '@/components/modal'
import { getCapacidadInfo } from '@/lib/embarque-capacidad'
import type { Embarque, Pedido } from './types'

function calcularCapacidadProyectada(embarque: Embarque, pedidos: Pedido[], nuevosPedidoIds: string[]): { totalPacas: number; pesoKg: number } {
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

export function EmbarqueDetailModal({
  open,
  onClose,
  embarque,
  pedidos,
  embarques,
  getEstadoBadge,
  onChanged,
  onEmbarqueUpdated,
}: {
  open: boolean
  onClose: () => void
  embarque: Embarque | null
  pedidos: Pedido[]
  embarques: Embarque[]
  getEstadoBadge: (estado: string) => React.ReactNode
  onChanged: () => void
  onEmbarqueUpdated?: (embarque: Embarque) => void
}) {
  const router = useRouter()
  const { confirm, modal } = useConfirm()
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setSelectedPedidoIds([])
  }, [embarque?.id])

  if (!embarque) return null

  const disponiblesParaAsignar = pedidos.filter(
    (p) => !embarques.some((e) => e.pedidos?.some((ep) => ep.id === p.id))
  )

  const capacidadKg = embarque.capacidadKg || 500
  const capacidadActual = getCapacidadInfo(
    embarque.totalPacas || 0,
    embarque.pesoKg || 0,
    capacidadKg
  )
  const proyectada = calcularCapacidadProyectada(embarque, pedidos, selectedPedidoIds)
  const capacidadProyectada = getCapacidadInfo(proyectada.totalPacas, proyectada.pesoKg, capacidadKg)

  async function assignPedidos() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/embarques/${embarque!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedidoIds: selectedPedidoIds,
        }),
      })
      const data = await res.json()
      if (data.success) {
        if (data.embarque) {
          onEmbarqueUpdated?.(data.embarque)
        }
        setSelectedPedidoIds([])
        onChanged()
        toast.success('Pedidos asignados')
      } else {
        toast.error(data.error?.message || 'Error asignando pedidos')
      }
    } catch {
      toast.error('Error asignando pedidos')
    } finally {
      setSubmitting(false)
    }
  }

  async function eliminarPedido(pedidoId: string) {
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embarqueId: null }),
      })
      const data = await res.json()
      if (data.success) {
        setSelectedPedidoIds((prev) => prev.filter((id) => id !== pedidoId))
        onChanged()
        toast.success('Pedido removido')
      } else {
        toast.error('Error removiendo pedido')
      }
    } catch {
      toast.error('Error removiendo pedido')
    }
  }

  async function cancelEmbarque() {
    const ok = await confirm('¿Cancelar este embarque? Los pedidos volverán a estar pendientes.')
    if (!ok) return
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/embarques/${embarque!.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Embarque cancelado')
        onClose()
        onChanged()
      } else {
        toast.error(data.error?.message || 'Error')
      }
    } catch {
      toast.error('Error al cancelar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold">Embarque #{embarque.numero}</h2>
          <p className="text-gray-500">{embarque.trabajador.nombre}</p>
          {embarque.ruta && (
            <p className="text-sm text-blue-600">{embarque.ruta.nombre}</p>
          )}
        </div>
        {getEstadoBadge(embarque.estado)}
      </div>

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

      {embarque.estado === 'ABIERTO' && (
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
            {proyectada.pesoKg > capacidadKg && (
              <p className="text-xs text-red-600 mt-1">
                ⚠️ Excederá capacidad máxima ({capacidadKg}kg)
              </p>
            )}
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
          {embarque.pedidos?.map((pedido) => (
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
              {embarque.estado === 'ABIERTO' && (
                <button
                  onClick={() => eliminarPedido(pedido.id)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
          {(!embarque.pedidos || embarque.pedidos.length === 0) && (
            <p className="p-2 text-gray-500 text-sm">
              Sin pedidos asignados
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        {embarque.estado === 'ABIERTO' && (
          <>
            <button
              onClick={cancelEmbarque}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Cancelando...' : 'Cancelar'}
            </button>
            <button
              onClick={() => {
                onClose()
                router.push(`/embarques/${embarque.id}/cerrar`)
              }}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cerrar Embarque
            </button>
          </>
        )}
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
        >
          Volver
        </button>
      </div>
      {modal}
    </Modal>
  )
}
