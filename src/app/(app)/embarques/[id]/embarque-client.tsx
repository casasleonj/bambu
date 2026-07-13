'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { Modal } from '@/components/modal'
import { MoneyDisplay } from '@/components/money-display'
import { ClienteHistorialModal } from '@/components/cliente-historial-modal'
import { PedidoClienteDisplay } from '@/components/pedido-cliente-display'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { calcularEstadoPagoVisual } from '@/modules/pedidos/presentation/visual-states'
import { fetchResilient } from '@/lib/fetch-resilient'
import { generateUUID } from '@/lib/uuid'
import { getCapacidadInfo, PESOS_KG } from '@/lib/embarque-capacidad'
import { EmbarqueFormModal } from '../embarques-client/embarque-form-modal'
import type { EmbarqueDetalle, PedidoResumen } from './types'
import type { Trabajador, Ruta, EmbarqueEditable, Pedido } from '../embarques-client/types'

interface EmbarqueClientProps {
  embarque: EmbarqueDetalle
  trabajadores: Trabajador[]
  rutas: Ruta[]
  userRole?: string | null
  userId?: string | null
}

function pacasCount(p: PedidoResumen | Pedido) {
  return (
    (p.cPacaAguaPed || 0) +
    (p.cPacaHieloPed || 0) +
    (p.cBotellonFabPed || 0) +
    (p.cBotellonDomPed || 0) +
    (p.cBolsaAguaPed || 0) +
    (p.cBolsaHieloPed || 0)
  )
}

function getEstadoBadge(estado: string) {
  const styles: Record<string, string> = {
    ABIERTO: 'bg-green-100 text-green-800',
    EN_RUTA: 'bg-blue-100 text-blue-800',
    CERRADO: 'bg-gray-100 text-gray-800',
    CANCELADO: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[estado] || 'bg-gray-100 text-gray-600'}`}>
      {estado === 'EN_RUTA' ? 'En Ruta' : estado}
    </span>
  )
}

function getEstadoEntregaBadge(estado: string) {
  const styles: Record<string, string> = {
    PENDIENTE: 'bg-yellow-100 text-yellow-800',
    EN_RUTA: 'bg-sky-100 text-sky-800',
    ENTREGADO: 'bg-green-100 text-green-800',
    NO_ENTREGADO: 'bg-orange-100 text-orange-800',
    CANCELADO: 'bg-gray-100 text-gray-600',
    ANULADO: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[estado] || 'bg-gray-100 text-gray-500'}`}>
      {estado.replace('_', ' ')}
    </span>
  )
}

function PagoCell({ pedido, userRole }: { pedido: PedidoResumen; userRole?: string | null }) {
  const visual = calcularEstadoPagoVisual({
    estadoPago: pedido.estadoPago,
    estadoEntrega: pedido.estadoEntrega,
    saldo: pedido.saldo,
    total: pedido.total,
    totalPagado: pedido.totalPagado,
  })

  if (visual.key === 'FIADO') {
    return <span className="text-sm font-semibold text-red-600"><MoneyDisplay value={pedido.saldo} userRole={userRole} /></span>
  }
  if (visual.key === 'PAGADO') {
    return <span className="text-xs text-green-600 font-medium">✓</span>
  }
  if (visual.key === 'ANULADO') {
    return <span className="text-xs text-gray-500 font-medium">Anulado</span>
  }
  return <span className="text-xs text-gray-400 font-medium">—</span>
}

function PedidoItems({ pedido }: { pedido: PedidoResumen }) {
  const items = []
  if (pedido.cPacaAguaPed > 0) items.push({ code: 'PACA_AGUA', cant: pedido.cPacaAguaPed })
  if (pedido.cPacaHieloPed > 0) items.push({ code: 'PACA_HIELO', cant: pedido.cPacaHieloPed })
  if (pedido.cBotellonFabPed > 0) items.push({ code: 'BOTELLON', cant: pedido.cBotellonFabPed })
  if (pedido.cBotellonDomPed > 0) items.push({ code: 'BOTELLON', cant: pedido.cBotellonDomPed })
  if (pedido.cBolsaAguaPed > 0) items.push({ code: 'BOLSA_AGUA', cant: pedido.cBolsaAguaPed })
  if (pedido.cBolsaHieloPed > 0) items.push({ code: 'BOLSA_HIELO', cant: pedido.cBolsaHieloPed })

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, idx) => {
        const meta = getProductoIconConfig(item.code)
        const Icon = meta.Icon
        return (
          <span key={`${item.code}-${idx}`} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
            <Icon size={12} />
            <span>{item.cant}</span>
          </span>
        )
      })}
    </div>
  )
}

interface ClienteResumen {
  id: string
  nombre: string
  barrio: string | null
  telefono: string | null
  pedidos: number
  total: number
  saldo: number
}

function buildClientesResumen(pedidos: PedidoResumen[]): ClienteResumen[] {
  const map = new Map<string, ClienteResumen>()
  for (const p of pedidos) {
    if (!p.cliente) continue
    const existente = map.get(p.cliente.id)
    if (existente) {
      existente.pedidos += 1
      existente.total += p.total
      existente.saldo += p.saldo
    } else {
      map.set(p.cliente.id, {
        id: p.cliente.id,
        nombre: p.cliente.nombre,
        barrio: p.cliente.barrio,
        telefono: p.cliente.telefono,
        pedidos: 1,
        total: p.total,
        saldo: p.saldo,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

function toEmbarqueEditable(embarque: EmbarqueDetalle): EmbarqueEditable {
  return {
    id: embarque.id,
    trabajador: embarque.trabajador,
    ruta: embarque.ruta,
    horaSalida: embarque.horaSalida,
    tipoMoto: embarque.tipoMoto,
    baseDinero: embarque.baseDinero,
    obs: embarque.obs,
    productos: (embarque.productos || []).map((p) => ({
      producto: p.producto,
      cargadas: p.cargadas,
      devueltas: p.devueltas ?? 0,
      cambios: p.cambios ?? 0,
      rotas: p.rotas ?? 0,
    })),
  }
}

export function EmbarqueClient({ embarque: initialEmbarque, trabajadores, rutas, userRole }: EmbarqueClientProps) {
  const router = useRouter()
  const { confirm, modal } = useConfirm()
  const [embarque, setEmbarque] = useState(initialEmbarque)
  const [pedidos, setPedidos] = useState(embarque.pedidos)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [submittingAction, setSubmittingAction] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pedidos' | 'clientes'>('pedidos')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [availablePedidos, setAvailablePedidos] = useState<Pedido[]>([])
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [historialModal, setHistorialModal] = useState<{ open: boolean; clienteId: string; clienteNombre: string }>({
    open: false,
    clienteId: '',
    clienteNombre: '',
  })

  const canManage = userRole === 'ADMIN' || userRole === 'ASISTENTE'
  const isEditable = embarque.estado === 'ABIERTO' || embarque.estado === 'EN_RUTA'
  const isOpen = embarque.estado === 'ABIERTO'
  const isEnRuta = embarque.estado === 'EN_RUTA'
  const isClosed = embarque.estado === 'CERRADO'
  const clientesUnicos = buildClientesResumen(pedidos)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/embarques/${embarque.id}?full=true`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      if (data.success && data.embarque) {
        setEmbarque(data.embarque)
        setPedidos(data.embarque.pedidos || [])
      }
    } catch {
      // Silently ignore refresh failures; the page remains usable
    }
  }, [embarque.id])

  const handleRemove = useCallback(async (pedido: PedidoResumen) => {
    if (!canManage || !isEditable) return
    const ok = await confirm({
      title: 'Quitar pedido del embarque',
      message: `¿Quitar el pedido #${pedido.numero} del embarque #${embarque.numeroDia || embarque.numero}?`,
      description: 'El pedido volverá a estado PENDIENTE y podrá asignarse a otro embarque.',
      variant: 'warning',
      confirmLabel: 'Quitar',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return

    setRemovingId(pedido.id)
    try {
      const res = await fetch(`/api/embarques/${embarque.id}/pedidos/${pedido.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Pedido #${pedido.numero} removido del embarque`)
        setPedidos((prev) => prev.filter((p) => p.id !== pedido.id))
      } else {
        toast.error(data.error?.message || 'Error removiendo pedido')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setRemovingId(null)
    }
  }, [canManage, isEditable, confirm, embarque.id, embarque.numero, embarque.numeroDia])

  const handleEnviar = async () => {
    if (!canManage || !isOpen) return
    const tienePedidos = pedidos.length > 0
    const ok = await confirm({
      title: 'Enviar embarque en ruta',
      message: tienePedidos
        ? `¿Enviar el embarque #${embarque.numeroDia || embarque.numero} en ruta? Se registrará la hora de salida.`
        : 'Este embarque no tiene pedidos. ¿Enviar en ruta para venta libre?',
      variant: 'warning',
      confirmLabel: 'Enviar en Ruta',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return

    setSubmittingAction('enviar')
    try {
      const res = await fetch(`/api/embarques/${embarque.id}/enviar`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Embarque enviado en ruta')
        await refresh()
      } else {
        toast.error(data.error?.message || 'Error enviando embarque')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleCancelar = async () => {
    if (!canManage || !isOpen) return
    const ok = await confirm({
      title: 'Cancelar embarque',
      message: `¿Cancelar el embarque #${embarque.numeroDia || embarque.numero}?`,
      description: 'Los pedidos volverán a estado PENDIENTE. Esta acción no se puede deshacer.',
      variant: 'destructive',
      confirmLabel: 'Cancelar Embarque',
      cancelLabel: 'Volver',
    })
    if (!ok) return

    setSubmittingAction('cancelar')
    const result = await fetchResilient<{ success: boolean }>(
      `/api/embarques/${embarque.id}`,
      {
        method: 'DELETE',
        body: { offlineId: generateUUID() },
        localEndpoint: 'cancelar-embarque',
      }
    )
    if (result.status === 'offline') {
      toast.info('Sin conexión. Cancelación guardada, se aplicará al recuperar la red.')
    } else if (result.status === 'error') {
      toast.error(result.error)
    } else {
      toast.success('Embarque cancelado')
      router.push('/embarques')
    }
    setSubmittingAction(null)
  }

  const handleEditar = () => {
    if (!canManage || !isOpen) return
    setShowEditModal(true)
  }

  const loadAvailablePedidos = useCallback(async () => {
    setLoadingAvailable(true)
    try {
      const [pedidosRes, embarquesRes] = await Promise.all([
        fetch('/api/pedidos?all=true', { credentials: 'include' }),
        fetch('/api/embarques?all=true', { credentials: 'include' }),
      ])
      const pedidosData = await pedidosRes.json()
      const embarquesData = await embarquesRes.json()
      const allPedidos: Pedido[] = pedidosData.pedidos || pedidosData.data || []
      const allEmbarques: Array<{ id: string; pedidos?: Pedido[] }> = embarquesData.embarques || embarquesData.data || []
      const disponibles = allPedidos.filter(
        (p) => p.estado === 'PENDIENTE' && !allEmbarques.some((e) => e.id !== embarque.id && e.pedidos?.some((ep) => ep.id === p.id))
      )
      setAvailablePedidos(disponibles)
    } catch {
      toast.error('Error cargando pedidos disponibles')
    } finally {
      setLoadingAvailable(false)
    }
  }, [embarque.id])

  useEffect(() => {
    if (showAssignModal) {
      setSelectedPedidoIds([])
      loadAvailablePedidos()
    }
  }, [showAssignModal, loadAvailablePedidos])

  const capacidadKg = embarque.capacidadKg || 500
  const currentPacas = embarque.totalPacas || pedidos.reduce((s, p) => s + pacasCount(p), 0)
  const currentPeso = embarque.pesoKg || pedidos.reduce((s, p) => {
    return s +
      (p.cPacaAguaPed || 0) * PESOS_KG.PACA_AGUA +
      (p.cPacaHieloPed || 0) * PESOS_KG.PACA_HIELO +
      (p.cBotellonFabPed || 0) * PESOS_KG.BOTELLON +
      (p.cBotellonDomPed || 0) * PESOS_KG.BOTELLON +
      (p.cBolsaAguaPed || 0) * PESOS_KG.BOLSA_AGUA +
      (p.cBolsaHieloPed || 0) * PESOS_KG.BOLSA_HIELO
  }, 0)

  const selectedNuevosPacas = selectedPedidoIds.reduce((s, id) => {
    const p = availablePedidos.find((ap) => ap.id === id)
    return s + (p ? pacasCount(p) : 0)
  }, 0)
  const selectedNuevosPeso = selectedPedidoIds.reduce((s, id) => {
    const p = availablePedidos.find((ap) => ap.id === id)
    if (!p) return s
    return s +
      (p.cPacaAguaPed || 0) * PESOS_KG.PACA_AGUA +
      (p.cPacaHieloPed || 0) * PESOS_KG.PACA_HIELO +
      (p.cBotellonFabPed || 0) * PESOS_KG.BOTELLON +
      (p.cBotellonDomPed || 0) * PESOS_KG.BOTELLON +
      (p.cBolsaAguaPed || 0) * PESOS_KG.BOLSA_AGUA +
      (p.cBolsaHieloPed || 0) * PESOS_KG.BOLSA_HIELO
  }, 0)

  const proyectadaTotal = currentPacas + selectedNuevosPacas
  const proyectadaPeso = currentPeso + selectedNuevosPeso
  const capacidadProyectada = getCapacidadInfo(proyectadaTotal, proyectadaPeso, capacidadKg)
  const excedeUnidades = proyectadaTotal > 70

  const handleAsignar = async () => {
    if (!canManage || !isEditable || selectedPedidoIds.length === 0) return
    setSubmittingAction('asignar')
    const result = await fetchResilient<{ success: boolean; embarque?: EmbarqueDetalle; error?: { message?: string } }>(
      `/api/embarques/${embarque.id}`,
      {
        method: 'PUT',
        body: { pedidoIds: selectedPedidoIds, offlineId: generateUUID() },
        localEndpoint: 'asignar-pedidos-embarque',
      }
    )
    if (result.status === 'offline') {
      toast.info('Sin conexión. Asignación guardada, se enviará al recuperar la red.')
      setShowAssignModal(false)
    } else if (result.status === 'error') {
      toast.error(result.error)
    } else {
      toast.success('Pedidos asignados')
      setShowAssignModal(false)
      await refresh()
    }
    setSubmittingAction(null)
  }

  const totalPacas = pedidos.reduce((s, p) => s + pacasCount(p), 0)
  const normales = pedidos.filter((p) => p.origen !== 'VENTA_LIBRE')
  const libres = pedidos.filter((p) => p.origen === 'VENTA_LIBRE')

  const primaryAction = isOpen
    ? { label: 'Enviar en Ruta →', action: handleEnviar, testId: 'enviar-embarque-button' }
    : isEnRuta
    ? { label: 'Cerrar y Cuadrar →', action: () => router.push(`/embarques/${embarque.id}/cerrar`), testId: 'cerrar-embarque-button' }
    : null

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Link
              href="/embarques"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 mb-2"
            >
              ← Volver a embarques
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-800">
                Embarque #{embarque.numeroDia > 0 ? embarque.numeroDia : embarque.numero}
              </h1>
              {getEstadoBadge(embarque.estado)}
            </div>
            <p className="text-gray-500 mt-1">
              {embarque.trabajador.nombre}
              {embarque.ruta && <span className="text-blue-600 font-medium"> · {embarque.ruta.nombre}</span>}
              {embarque.tipoMoto && <span className="text-gray-400"> · {embarque.tipoMoto}</span>}
            </p>
          </div>
          {embarque.capacidadInfo && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${embarque.capacidadInfo.color}`}>
              <span className="text-xl">{embarque.capacidadInfo.icon}</span>
              <div>
                <p className="text-sm font-medium">{embarque.capacidadInfo.label}</p>
                <p className="text-xs">
                  {embarque.capacidadInfo.total} u. · {embarque.capacidadInfo.pesoKg.toFixed(1)}kg / {embarque.capacidadInfo.capacidadKg}kg
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action bar */}
        {canManage && primaryAction && (
          <div className="flex items-center gap-2">
            <button
              data-testid={primaryAction.testId}
              onClick={primaryAction.action}
              disabled={submittingAction === 'enviar'}
              className="flex-1 md:flex-none px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
            >
              {submittingAction === 'enviar' ? 'Enviando...' : primaryAction.label}
            </button>
            <div className="relative group">
              <button
                data-testid="embarque-actions-menu"
                className="px-3 py-2.5 border rounded-lg hover:bg-gray-50 transition"
                aria-label="Más acciones"
              >
                ⋯
              </button>
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border py-1 hidden group-hover:block hover:block z-10">
                {isOpen && (
                  <>
                    <button
                      data-testid="asignar-pedidos-button"
                      onClick={() => setShowAssignModal(true)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition"
                    >
                      Asignar pedidos
                    </button>
                    <button
                      data-testid="editar-embarque-button"
                      onClick={handleEditar}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition"
                    >
                      Editar
                    </button>
                    <hr className="my-1" />
                    <button
                      data-testid="cancelar-embarque-button"
                      onClick={handleCancelar}
                      disabled={submittingAction === 'cancelar'}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      {submittingAction === 'cancelar' ? 'Cancelando...' : 'Cancelar embarque'}
                    </button>
                  </>
                )}
                {isEnRuta && (
                  <button
                    data-testid="asignar-pedidos-button"
                    onClick={() => setShowAssignModal(true)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition"
                  >
                    Asignar pedidos
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Closed summary */}
        {isClosed && (
          <div className="bg-white p-4 rounded-xl shadow border-l-4 border-gray-400">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">Embarque cerrado</p>
                <p className="text-xs text-gray-500">
                  {embarque.horaLlegada
                    ? `Llegada: ${new Date(embarque.horaLlegada).toLocaleTimeString()}`
                    : 'Cierre registrado'}
                  {embarque.dineroEntregado > 0 && ` · Dinero entregado: `}
                  {embarque.dineroEntregado > 0 && (
                    <MoneyDisplay value={embarque.dineroEntregado} userRole={userRole} />
                  )}
                </p>
              </div>
              <Link
                href={`/embarques/${embarque.id}/cerrar`}
                data-testid="ver-cierre-button"
                className="px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition font-medium"
              >
                Ver cierre completo →
              </Link>
            </div>
            {embarque.deudas && embarque.deudas.length > 0 && (
              <div className="mt-3 pt-3 border-t space-y-2">
                {embarque.deudas.map((deuda) => (
                  <div key={deuda.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600">💳</span>
                      <span className="text-gray-700">Deuda generada por faltante de caja</span>
                      <span className="text-xs text-gray-400">({deuda.descripcion})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-800"><MoneyDisplay value={deuda.montoOriginal} userRole={userRole} /></span>
                      <Link
                        href={`/trabajadores/${embarque.trabajador.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Ver trabajador →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-xl shadow">
            <p className="text-xs text-gray-500">Pedidos</p>
            <p className="text-xl font-bold text-gray-800">{pedidos.length}</p>
          </div>
          <div className="bg-white p-3 rounded-xl shadow">
            <p className="text-xs text-gray-500">Programados</p>
            <p className="text-xl font-bold text-green-600">{normales.length}</p>
          </div>
          <div className="bg-white p-3 rounded-xl shadow">
            <p className="text-xs text-gray-500">Ventas libres</p>
            <p className="text-xl font-bold text-purple-600">{libres.length}</p>
          </div>
          <div className="bg-white p-3 rounded-xl shadow">
            <p className="text-xs text-gray-500">Pacas totales</p>
            <p className="text-xl font-bold text-gray-800">{totalPacas}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b">
            <h2 className="text-lg font-semibold text-gray-800">Pedidos asignados</h2>
          </div>
          <div className="flex border-b">
            <button
              data-testid="tab-pedidos"
              onClick={() => setActiveTab('pedidos')}
              className={`px-6 py-3 text-sm font-medium transition ${
                activeTab === 'pedidos'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Pedidos ({pedidos.length})
            </button>
            <button
              data-testid="tab-clientes"
              onClick={() => setActiveTab('clientes')}
              className={`px-6 py-3 text-sm font-medium transition ${
                activeTab === 'clientes'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Clientes ({clientesUnicos.length})
            </button>
          </div>

          {activeTab === 'pedidos' ? (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Productos</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3 text-right">Pago</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pedidos.map((pedido) => (
                      <tr key={pedido.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-500">#{pedido.numero}</td>
                        <td className="px-4 py-3">
                          <PedidoClienteDisplay
                            clienteId={pedido.clienteId || pedido.cliente?.id || ''}
                            nombreCli={pedido.nombreCli || pedido.cliente?.nombre || 'Sin cliente'}
                            apellidoCli={pedido.apellidoCli || pedido.cliente?.apellido}
                            negocioId={pedido.negocioId}
                            nombreNegocioCli={pedido.nombreNegocioCli}
                            variant="row"
                          />
                          <p className="text-xs text-gray-400">{pedido.cliente?.barrio || pedido.cliente?.telefono || ''}</p>
                        </td>
                        <td className="px-4 py-3"><PedidoItems pedido={pedido} /></td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-800"><MoneyDisplay value={pedido.total} userRole={userRole} /></td>
                        <td className="px-4 py-3 text-right"><PagoCell pedido={pedido} userRole={userRole} /></td>
                        <td className="px-4 py-3 text-center">{getEstadoEntregaBadge(pedido.estadoEntrega)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {pedido.cliente && (
                              <button
                                onClick={() => {
                                  const { id, nombre } = pedido.cliente!
                                  setHistorialModal({ open: true, clienteId: id, clienteNombre: nombre })
                                }}
                                className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 rounded hover:bg-purple-50 transition"
                              >
                                Historial
                              </button>
                            )}
                            <Link
                              href={`/pedidos?openPedido=${pedido.id}`}
                              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition"
                            >
                              Ver pedido
                            </Link>
                            {canManage && isEditable && (
                              <button
                                onClick={() => handleRemove(pedido)}
                                disabled={removingId === pedido.id}
                                className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50 transition disabled:opacity-50"
                              >
                                {removingId === pedido.id ? '...' : 'Quitar'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pedidos.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                          Sin pedidos asignados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {pedidos.map((pedido) => (
                  <div key={pedido.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-bold text-gray-800">#{pedido.numero}</p>
                        <PedidoClienteDisplay
                          clienteId={pedido.clienteId || pedido.cliente?.id || ''}
                          nombreCli={pedido.nombreCli || pedido.cliente?.nombre || 'Sin cliente'}
                          apellidoCli={pedido.apellidoCli || pedido.cliente?.apellido}
                          negocioId={pedido.negocioId}
                          nombreNegocioCli={pedido.nombreNegocioCli}
                          variant="card"
                        />
                        <p className="text-xs text-gray-400">{pedido.cliente?.barrio || pedido.cliente?.telefono || ''}</p>
                      </div>
                      {getEstadoEntregaBadge(pedido.estadoEntrega)}
                    </div>
                    <div className="mb-2"><PedidoItems pedido={pedido} /></div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-gray-800"><MoneyDisplay value={pedido.total} userRole={userRole} /></span>
                      <PagoCell pedido={pedido} userRole={userRole} />
                    </div>
                    <div className="flex gap-2 mt-3">
                      {pedido.cliente && (
                        <button
                          onClick={() => {
                            const { id, nombre } = pedido.cliente!
                            setHistorialModal({ open: true, clienteId: id, clienteNombre: nombre })
                          }}
                          className="flex-1 text-center text-xs text-purple-600 hover:text-purple-800 px-2 py-2 rounded bg-purple-50 transition"
                        >
                          Historial
                        </button>
                      )}
                      <Link
                        href={`/pedidos?openPedido=${pedido.id}`}
                        className="flex-1 text-center text-xs text-blue-600 hover:text-blue-800 px-2 py-2 rounded bg-blue-50 transition"
                      >
                        Ver pedido
                      </Link>
                      {canManage && isEditable && (
                        <button
                          onClick={() => handleRemove(pedido)}
                          disabled={removingId === pedido.id}
                          className="flex-1 text-center text-xs text-red-600 hover:text-red-800 px-2 py-2 rounded bg-red-50 transition disabled:opacity-50"
                        >
                          {removingId === pedido.id ? '...' : 'Quitar'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {pedidos.length === 0 && (
                  <p className="p-6 text-center text-sm text-gray-500">Sin pedidos asignados</p>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Desktop clientes table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Pedidos</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Saldo</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientesUnicos.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-800">{c.nombre}</p>
                          <p className="text-xs text-gray-400">{c.barrio || c.telefono || ''}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{c.pedidos}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-800"><MoneyDisplay value={c.total} userRole={userRole} /></td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-600"><MoneyDisplay value={c.saldo} userRole={userRole} /></td>
                        <td className="px-4 py-3 text-right">
                          <button
                            data-testid="cliente-historial-button"
                            onClick={() => setHistorialModal({ open: true, clienteId: c.id, clienteNombre: c.nombre })}
                            className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 rounded hover:bg-purple-50 transition"
                          >
                            Ver historial
                          </button>
                        </td>
                      </tr>
                    ))}
                    {clientesUnicos.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                          Sin clientes asignados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile clientes cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {clientesUnicos.map((c) => (
                  <div key={c.id} className="p-4 hover:bg-gray-50">
                    <p className="text-sm font-medium text-gray-800">{c.nombre}</p>
                    <p className="text-xs text-gray-400">{c.barrio || c.telefono || ''}</p>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Pedidos</p>
                        <p className="font-medium text-gray-800">{c.pedidos}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="font-medium text-gray-800"><MoneyDisplay value={c.total} userRole={userRole} /></p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Saldo</p>
                        <p className="font-medium text-red-600"><MoneyDisplay value={c.saldo} userRole={userRole} /></p>
                      </div>
                    </div>
                    <button
                      data-testid="mobile-cliente-historial-button"
                      onClick={() => setHistorialModal({ open: true, clienteId: c.id, clienteNombre: c.nombre })}
                      className="mt-3 w-full text-center text-xs text-purple-600 hover:text-purple-800 px-2 py-2 rounded bg-purple-50 transition"
                    >
                      Ver historial
                    </button>
                  </div>
                ))}
                {clientesUnicos.length === 0 && (
                  <p className="p-6 text-center text-sm text-gray-500">Sin clientes asignados</p>
                )}
              </div>
            </>
          )}
        </div>

        {embarque.obs && (
          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-xs text-gray-500 uppercase font-medium mb-1">Observaciones</p>
            <p className="text-sm text-gray-700">{embarque.obs}</p>
          </div>
        )}
      </div>

      {/* Assign modal */}
      <Modal open={showAssignModal} onClose={() => setShowAssignModal(false)} className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Asignar pedidos</h2>
        {loadingAvailable ? (
          <p className="text-sm text-gray-500">Cargando pedidos...</p>
        ) : availablePedidos.length === 0 ? (
          <p className="text-sm text-gray-500">No hay pedidos pendientes disponibles.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {availablePedidos.map((p) => (
              <label key={p.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPedidoIds.includes(p.id)}
                  onChange={(e) => {
                    setSelectedPedidoIds((prev) =>
                      e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                    )
                  }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">#{p.numero} — {p.cliente?.nombre || 'Sin cliente'}</p>
                  <p className="text-xs text-gray-500">
                    {p.cPacaAguaPed || 0} PACA_AGUA · {p.cPacaHieloPed || 0} PACA_HIELO · {p.cBotellonFabPed || 0} BOTELLON
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
        {selectedPedidoIds.length > 0 && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${capacidadProyectada.color} bg-opacity-10`}>
            <p className="font-medium">Proyección: {proyectadaTotal} u. · {proyectadaPeso.toFixed(1)}kg</p>
            <p className="text-xs">{capacidadProyectada.label} ({capacidadProyectada.porcentaje.toFixed(0)}%)</p>
            {excedeUnidades && <p className="text-xs text-red-600 font-medium">Excede límite operativo de 70 unidades</p>}
          </div>
        )}
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setShowAssignModal(false)}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleAsignar}
            disabled={selectedPedidoIds.length === 0 || submittingAction === 'asignar' || excedeUnidades}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submittingAction === 'asignar' ? 'Asignando...' : 'Asignar'}
          </button>
        </div>
      </Modal>

      {/* Edit modal */}
      <EmbarqueFormModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSaved={async () => {
          setShowEditModal(false)
          await refresh()
        }}
        trabajadores={trabajadores}
        rutas={rutas}
        mode="edit"
        embarque={toEmbarqueEditable(embarque)}
      />

      <ClienteHistorialModal
        open={historialModal.open}
        onClose={() => setHistorialModal((prev) => ({ ...prev, open: false }))}
        clienteId={historialModal.clienteId}
        clienteNombre={historialModal.clienteNombre}
      />
      {modal}
    </div>
  )
}
