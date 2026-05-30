'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { useConfirm } from '@/components/confirm-modal'
import { Modal } from '@/components/modal'
import { getCapacidadInfo, PESOS_KG } from '@/lib/embarque-capacidad'
import type { Embarque, Pedido, Trabajador } from './types'

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
      (p.cPacaAguaPed || 0) * PESOS_KG.PACA_AGUA +
      (p.cPacaHieloPed || 0) * PESOS_KG.PACA_HIELO +
      (p.cBotellonFabPed || 0) * PESOS_KG.BOTELLON +
      (p.cBotellonDomPed || 0) * PESOS_KG.BOTELLON +
      (p.cBolsaAguaPed || 0) * PESOS_KG.BOLSA_AGUA +
      (p.cBolsaHieloPed || 0) * PESOS_KG.BOLSA_HIELO,
    0
  )
  return { totalPacas: pacasActuales + pacasNuevas, pesoKg: pesoActual + pesoNuevo }
}

function pacasCount(p: Pedido) {
  return (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) + (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) + (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0)
}

function PedidoRow({ pedido, label }: { pedido: Pedido; label?: string }) {
  return (
    <div className="flex justify-between items-center p-2 hover:bg-gray-50">
      <span className="text-sm">
        #{pedido.numero} - {pedido.cliente?.nombre || 'Sin cliente'} ({pedido.cliente?.barrio || 'Sin zona'})
        {label && (
          <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{label}</span>
        )}
        <span className="block text-xs text-gray-500">
          {pedido.cPacaAguaPed > 0 && `🍶 ${pedido.cPacaAguaPed} `}
          {pedido.cPacaHieloPed > 0 && `🧊 ${pedido.cPacaHieloPed} `}
          {pedido.cBotellonFabPed > 0 && `🏭 ${pedido.cBotellonFabPed} `}
          {pedido.cBotellonDomPed > 0 && `🏠 ${pedido.cBotellonDomPed} `}
          {pedido.cBolsaAguaPed > 0 && `💧 ${pedido.cBolsaAguaPed} `}
          {pedido.cBolsaHieloPed > 0 && `❄️ ${pedido.cBolsaHieloPed} `}
        </span>
      </span>
    </div>
  )
}

function SummaryRow({ pedidos, trabajador }: { pedidos: Pedido[]; trabajador: Trabajador }) {
  const normales = pedidos.filter((p) => p.origen !== 'VENTA_LIBRE')
  const libres = pedidos.filter((p) => p.origen === 'VENTA_LIBRE')
  const totalPacas = pedidos.reduce((s, p) => s + pacasCount(p), 0)

  const totalAgua = pedidos.reduce((s, p) => s + (p.cPacaAguaEnt || p.cPacaAguaPed || 0), 0)
  const totalHielo = pedidos.reduce((s, p) => s + (p.cPacaHieloEnt || p.cPacaHieloPed || 0), 0)
  const totalBotFab = pedidos.reduce((s, p) => s + (p.cBotellonFabEnt || p.cBotellonFabPed || 0), 0)
  const totalBotDom = pedidos.reduce((s, p) => s + (p.cBotellonDomEnt || p.cBotellonDomPed || 0), 0)
  const totalBolAgua = pedidos.reduce((s, p) => s + (p.cBolsaAguaEnt || p.cBolsaAguaPed || 0), 0)
  const totalBolHielo = pedidos.reduce((s, p) => s + (p.cBolsaHieloEnt || p.cBolsaHieloPed || 0), 0)

  const comAgua = totalAgua * Number(trabajador.comPacaAgua || 0)
  const comHielo = totalHielo * Number(trabajador.comPacaHielo || 0)
  const comBotellon = (totalBotFab + totalBotDom) * Number(trabajador.comBotellon || 0)
  const totalComision = comAgua + comHielo + comBotellon

  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-gray-800">{pedidos.length} pedidos</span>
        <span className="text-gray-500">{totalPacas} pacas</span>
        {normales.length > 0 && (
          <span className="text-green-700">{normales.length} pedidos programados</span>
        )}
        {libres.length > 0 && (
          <span className="text-purple-700">{libres.length} ventas libres</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {totalAgua > 0 && <span>🚛 Agua: {totalAgua}</span>}
        {totalHielo > 0 && <span>🧊 Hielo: {totalHielo}</span>}
        {totalBotFab + totalBotDom > 0 && <span>🫗 Botellones: {totalBotFab + totalBotDom}</span>}
        {totalBolAgua > 0 && <span>💧 Bolsas agua: {totalBolAgua}</span>}
        {totalBolHielo > 0 && <span>❄️ Bolsas hielo: {totalBolHielo}</span>}
      </div>
      {totalComision > 0 && (
        <div className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded">
          Comisión: {formatCurrency(totalComision)}
        </div>
      )}
    </div>
  )
}

function PedidoListGrouped({ pedidos }: { pedidos: Pedido[] }) {
  const normales = pedidos.filter((p) => p.origen !== 'VENTA_LIBRE')
  const libres = pedidos.filter((p) => p.origen === 'VENTA_LIBRE')

  return (
    <div className="border rounded-lg divide-y mt-2 max-h-60 overflow-y-auto">
      {normales.map((pedido) => (
        <PedidoRow key={pedido.id} pedido={pedido} />
      ))}
      {libres.map((pedido) => (
        <PedidoRow key={pedido.id} pedido={pedido} label="Venta libre" />
      ))}
      {pedidos.length === 0 && (
        <p className="p-2 text-gray-500 text-sm">Sin pedidos asignados</p>
      )}
    </div>
  )
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
  onEdit,
}: {
  open: boolean
  onClose: () => void
  embarque: Embarque | null
  pedidos: Pedido[]
  embarques: Embarque[]
  getEstadoBadge: (estado: string) => React.ReactNode
  onChanged: () => void
  onEmbarqueUpdated?: (embarque: Embarque) => void
  onEdit?: (embarque: Embarque) => void
}) {
  const router = useRouter()
  const { confirm, modal } = useConfirm()
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [showClosedPedidos, setShowClosedPedidos] = useState(false)

  useEffect(() => {
    setSelectedPedidoIds([])
  }, [embarque?.id])

  if (!embarque) return null

  const disponiblesParaAsignar = pedidos.filter(
    (p) => p.estado === 'PENDIENTE' && !embarques.some((e) => e.pedidos?.some((ep) => ep.id === p.id))
  )

  const capacidadKg = embarque.capacidadKg || 500
  const capacidadActual = getCapacidadInfo(
    embarque.totalPacas || 0,
    embarque.pesoKg || 0,
    capacidadKg
  )
  const proyectada = calcularCapacidadProyectada(embarque, pedidos, selectedPedidoIds)
  const capacidadProyectada = getCapacidadInfo(proyectada.totalPacas, proyectada.pesoKg, capacidadKg)

  // Unidades comprometidas en pedidos asignados (no venta libre)
  const pedidosAsignados = embarque.pedidos?.filter((p) => p.origen !== 'VENTA_LIBRE') || []
  const unidadesComprometidas = pedidosAsignados.reduce((s, p) =>
    s + (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) +
        (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) +
        (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0), 0)

  // Unidades nuevas que se asignarían con la selección actual
  const unidadesSeleccionadas = selectedPedidoIds.reduce((s, id) => {
    const p = pedidos.find((p) => p.id === id)
    return s + (p ? (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) +
        (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) +
        (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0) : 0)
  }, 0)

  // Disponible para venta libre = carga - (pedidos asignados + seleccionados)
  const unidadesDisponible = Math.max(0, (embarque.totalPacas || 0) - unidadesComprometidas - unidadesSeleccionadas)

  // Flags para UI
  const excedeUnidades = capacidadProyectada.total > 70
  const excedePeso = capacidadProyectada.pesoKg > capacidadKg

  async function assignPedidos() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/embarques/${embarque!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error asignando pedidos'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function eliminarPedido(pedidoId: string) {
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error removiendo pedido'
      toast.error(msg)
    }
  }

  async function cancelEmbarque() {
    const ok = await confirm('¿Cancelar este embarque? Los pedidos volverán a estar pendientes.')
    if (!ok) return
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/embarques/${embarque!.id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        toast.success('Embarque cancelado')
        onClose()
        onChanged()
      } else {
        toast.error(data.error?.message || 'Error')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function enviarEnRuta() {
    const ok = await confirm('¿Enviar este embarque en ruta? Se registrará la hora de salida.')
    if (!ok) return
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/embarques/${embarque!.id}/enviar`, { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        toast.success('Embarque enviado en ruta')
        onChanged()
        if (data.embarque) onEmbarqueUpdated?.(data.embarque)
      } else {
        toast.error(data.error?.message || 'Error enviando embarque')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error enviando embarque'
      toast.error(msg)
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

      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-2 ${capacidadActual.color}`}>
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
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Carga:</span>
            <span className="font-medium">{embarque.totalPacas || 0} unidades</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Pedidos asignados:</span>
            <span className="font-medium">{pedidosAsignados.length} ({unidadesComprometidas} unidades)</span>
          </div>
          {selectedPedidoIds.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Seleccionados:</span>
              <span className="font-medium text-blue-600">+{unidadesSeleccionadas} unidades</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1">
            <span className="text-gray-600">Disponible para venta libre:</span>
            <span className={`font-bold ${unidadesDisponible === 0 ? 'text-red-600' : 'text-green-600'}`}>
              {unidadesDisponible} unidades
            </span>
          </div>
        </div>
      )}

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
            {excedeUnidades && (
              <p className="text-xs text-red-600 mt-1 font-medium">
                 ⛔ Excede máximo de 70 unidades ({capacidadProyectada.total})
              </p>
            )}
            {excedePeso && !excedeUnidades && (
              <p className="text-xs text-yellow-600 mt-1">
                ⚠️ Excede peso recomendado ({capacidadKg}kg) — proceder con precaución
              </p>
            )}
          </div>

          <button
            onClick={assignPedidos}
            disabled={selectedPedidoIds.length === 0 || submitting || excedeUnidades}
            className="w-full mb-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Asignando...' : 'Asignar Pedidos'}
          </button>
        </>
      )}

      <div className="mb-4">
        <h3 className="font-medium text-gray-700 mb-2">Pedidos Asignados</h3>

        {embarque.estado === 'CERRADO' ? (
          <>
            <SummaryRow pedidos={embarque.pedidos || []} trabajador={embarque.trabajador} />
            <button
              onClick={() => setShowClosedPedidos(!showClosedPedidos)}
              className="w-full mt-2 px-3 py-2 text-sm text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition font-medium"
            >
              {showClosedPedidos ? 'Ocultar detalle ▲' : 'Ver detalle ▼'}
            </button>
            {showClosedPedidos && (
              <PedidoListGrouped pedidos={embarque.pedidos || []} />
            )}
          </>
        ) : (
          <div className="border rounded-lg divide-y">
            {embarque.pedidos?.map((pedido) => (
              <div key={pedido.id} className="flex justify-between items-center p-2">
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
              <p className="p-2 text-gray-500 text-sm">Sin pedidos asignados</p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {embarque.estado === 'ABIERTO' && (
          <>
            {onEdit && (
              <button
                onClick={() => onEdit(embarque)}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Editar
              </button>
            )}
            <button
              onClick={cancelEmbarque}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Cancelando...' : 'Cancelar'}
            </button>
            <button
              onClick={enviarEnRuta}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enviando...' : 'Enviar en Ruta →'}
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
        {embarque.estado === 'EN_RUTA' && (
          <>
            <button
              onClick={() => {
                onClose()
                router.push(`/embarques/${embarque.id}/cerrar`)
              }}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cerrar y Cuadrar
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
