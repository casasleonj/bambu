'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/modal'
import { getGuiaAlerta, getBadgeColor, type AlertaTipo } from '@/lib/alertas-config'

interface Caso {
  id: string
  alertaTipo: string
  severidad: string
  titulo: string
  clienteId: string | null
  pedidoId: string | null
  cliente: { id: string; nombre: string; telefono: string } | null
  pedido: { id: string; numero: number; total: string } | null
}

interface ContextData {
  clienteVerificado?: boolean
  pedidoDisputa?: boolean
  pedidoEstadoPago?: string
  pedidoTieneFoto?: boolean
  clienteConSaldo?: boolean
}

interface Usuario {
  id: string
  username: string
  rol: string
}

interface CasoGuiaModalProps {
  caso: Caso
  contextData?: ContextData
  usuarios: Usuario[]
  onClose: () => void
  onStatusChange?: (casoId: string, newStatus: string) => void
}

const TIPO_LABELS: Record<string, string> = {
  '2DO_PEDIDO': '2do pedido hoy',
  '3RO_PEDIDO': '3ro+ pedido hoy',
  MONTO_ANOMALO: 'Monto anómalo',
  FIADO_REcurrente: 'Fiado recurrente',
  CLIENTE_BLOQUEADO: 'Cliente bloqueado',
  DISPUTA_ABIERTA: 'Disputa abierta',
  RECLAMACIONES_MULTIPLES: 'Cliente conflictivo',
  RECLAMACION_ACTIVA: 'Reclamación activa',
  PROMESA_PROXIMA_VENCER: 'Pago próximo a vencer',
  NO_ENTREGADO_REPETIDO: 'Entregas fallidas',
  DEVOLUCIONES_ANORMALES: 'Devoluciones sospechosas',
  ROTURAS_ANORMALES: 'Roturas sospechosas',
  DESCUENTO_NO_JUSTIFICADO: 'Descuento sin justificar',
  NOTA_CREDITO_FRECUENTE: 'Notas de crédito frecuentes',
  PRECIO_POR_DEBAJO_TABLA: 'Precio por debajo de tabla',
  REPARTIDOR_DEUDA_ALTA: 'Deuda de repartidor alta',
  CLIENTE_NO_VERIFICADO: 'Cliente no verificado',
  MULTIPLES_PEDIDOS_RAPIDO: 'Pedidos muy seguidos',
  CAMBIO_PRECIO_BRUSCO: 'Cambio de precio brusco',
}

function getSolucionesFiltradas(tipo: AlertaTipo, ctx?: ContextData): string[] {
  const guia = getGuiaAlerta(tipo)
  if (!guia) return []

  let soluciones = [...guia.soluciones]

  // Filtrar por contexto
  if (tipo === 'DISPUTA_ABIERTA') {
    soluciones = soluciones.filter(s => {
      if (s.toLowerCase().includes('foto') && ctx?.pedidoTieneFoto === false) return false
      return true
    })
  }

  if (tipo === 'CLIENTE_NO_VERIFICADO') {
    soluciones = soluciones.filter(s => {
      if (s.toLowerCase().includes('verific') && ctx?.clienteVerificado === true) return false
      return true
    })
  }

  if (tipo === 'MONTO_ANOMALO') {
    soluciones = soluciones.filter(s => {
      if (s.toLowerCase().includes('anul') && ctx?.pedidoEstadoPago === 'PAGADO') return false
      return true
    })
  }

  if (tipo === 'RECLAMACIONES_MULTIPLES') {
    soluciones = soluciones.filter(s => {
      if (s.toLowerCase().includes('bloqu') && ctx?.clienteConSaldo === false) return false
      return true
    })
  }

  // Max 4 pasos
  return soluciones.slice(0, 4)
}

function getAcciones(tipo: AlertaTipo) {
  const guia = getGuiaAlerta(tipo)
  return guia?.acciones || []
}

export function CasoGuiaModal({ caso, contextData, usuarios, onClose, onStatusChange }: CasoGuiaModalProps) {
  const router = useRouter()
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([])
  const [notas, setNotas] = useState('')
  const [asignadoAId, setAsignadoAId] = useState('')
  const [status, setStatus] = useState('ABIERTO')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [showAssign, setShowAssign] = useState(false)

  const tipo = caso.alertaTipo as AlertaTipo
  const soluciones = useMemo(() => getSolucionesFiltradas(tipo, contextData), [tipo, contextData])
  const acciones = useMemo(() => getAcciones(tipo), [tipo])

  useEffect(() => {
    setCheckedSteps(new Array(soluciones.length).fill(false))
  }, [soluciones.length])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  const toggleStep = (idx: number) => {
    const next = [...checkedSteps]
    next[idx] = !next[idx]
    setCheckedSteps(next)
  }

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message })
  }

  const handleAccion = async (accionId: string) => {
    // Acciones simples (PATCH inline)
    if (accionId === 'resolver_disputa' && caso.pedidoId) {
      setActionLoading(accionId)
      try {
        const res = await fetch(`/api/pedidos/${caso.pedidoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disputaAbierta: false }),
        })
        const data = await res.json()
        if (data.success) {
          showToast('success', 'Disputa cerrada')
          const idx = soluciones.findIndex(s => s.toLowerCase().includes('cerr') || s.toLowerCase().includes('disputa'))
          if (idx >= 0) toggleStep(idx)
        } else {
          showToast('error', data.error?.message || 'Error cerrando disputa')
        }
      } catch {
        showToast('error', 'Error de conexión')
      } finally {
        setActionLoading(null)
      }
      return
    }

    if (accionId === 'verificar_cliente' && caso.clienteId) {
      setActionLoading(accionId)
      try {
        const res = await fetch(`/api/clientes/${caso.clienteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verificado: true }),
        })
        const data = await res.json()
        if (data.success) {
          showToast('success', 'Cliente verificado')
          const idx = soluciones.findIndex(s => s.toLowerCase().includes('verific'))
          if (idx >= 0) toggleStep(idx)
        } else {
          showToast('error', data.error?.message || 'Error verificando cliente')
        }
      } catch {
        showToast('error', 'Error de conexión')
      } finally {
        setActionLoading(null)
      }
      return
    }

    if (accionId === 'bloquear_fiados' && caso.clienteId) {
      setActionLoading(accionId)
      try {
        const res = await fetch(`/api/clientes/${caso.clienteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bloqueado: true }),
        })
        const data = await res.json()
        if (data.success) {
          showToast('success', 'Fiados bloqueados')
        } else {
          showToast('error', data.error?.message || 'Error bloqueando fiados')
        }
      } catch {
        showToast('error', 'Error de conexión')
      } finally {
        setActionLoading(null)
      }
      return
    }

    // Acciones que redirigen
    if (accionId === 'registrar_pago') {
      router.push('/pedidos?tab=fiados')
      return
    }

    if (accionId === 'llamar_cliente' && caso.cliente?.telefono) {
      window.location.href = `tel:${caso.cliente.telefono}`
      return
    }

    if (accionId === 'ver_pedidos_hoy' && caso.clienteId) {
      router.push(`/pedidos?search=${caso.clienteId}`)
      return
    }

    if (accionId === 'ver_pedido' && caso.pedidoId) {
      router.push(`/pedidos?search=${caso.pedidoId}`)
      return
    }

    if (accionId === 'ver_cuentas') {
      return
    }

    if (accionId === 'ver_facturas') {
      router.push('/facturas')
      return
    }

    if (accionId === 'ver_reclamaciones') {
      router.push(`/clientes?openCliente=${caso.clienteId}`)
      return
    }

    if (accionId === 'ver_embarques') {
      router.push('/embarques')
      return
    }

    if (accionId === 'ver_repartidor') {
      router.push('/trabajadores')
      return
    }

    if (accionId === 'ver_precios' || accionId === 'ver_tabla_precios') {
      router.push('/productos')
      return
    }

    if (accionId === 'ver_foto' && caso.pedidoId) {
      router.push(`/pedidos?search=${caso.pedidoId}`)
      return
    }

    if (accionId === 'ver_descuento') {
      router.push('/nomina')
      return
    }

    if (accionId === 'ver_notas_credito') {
      router.push('/facturas')
      return
    }

    if (accionId === 'ver_gps') {
      router.push('/rutas')
      return
    }

    if (accionId === 'ver_historial' || accionId === 'ver_historial_cliente' || accionId === 'ver_cliente') {
      router.push(`/clientes?openCliente=${caso.clienteId}`)
      return
    }

    if (accionId === 'ir_cobrar') {
      return
    }

    if (accionId === 'editar_direccion') {
      showToast('info', 'Edita la dirección en el detalle del cliente')
      router.push(`/clientes?openCliente=${caso.clienteId}`)
      return
    }

    if (accionId === 'justificar_descuento') {
      router.push('/nomina')
      return
    }

    if (accionId === 'registrar_reposicion') {
      showToast('info', 'Registra la reposición en el detalle del trabajador')
      router.push('/trabajadores')
      return
    }

    if (accionId === 'extender_plazo' && caso.pedidoId) {
      showToast('info', 'Extiende el plazo en el detalle del pedido')
      router.push(`/pedidos?search=${caso.pedidoId}`)
      return
    }

    showToast('info', 'Acción no disponible directamente')
  }

  const handleAssign = async () => {
    setActionLoading('assign')
    try {
      const res = await fetch(`/api/casos/${caso.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asignadoAId: asignadoAId || null }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'Caso asignado')
        setShowAssign(false)
      } else {
        showToast('error', data.error?.message || 'Error asignando')
      }
    } catch {
      showToast('error', 'Error de conexión')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === 'RESUELTO' && !notas.trim()) {
      showToast('error', 'Agrega notas de resolución antes de resolver')
      return
    }

    setActionLoading('status')
    try {
      const res = await fetch(`/api/casos/${caso.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          notasResolucion: notas || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus(newStatus)
        onStatusChange?.(caso.id, newStatus)
        showToast('success', `Caso ${newStatus === 'RESUELTO' ? 'resuelto' : newStatus === 'CERRADO' ? 'cerrado' : 'reabierto'}`)
      } else {
        showToast('error', data.error?.message || 'Error actualizando')
      }
    } catch {
      showToast('error', 'Error de conexión')
    } finally {
      setActionLoading(null)
    }
  }

  const handleGoToCase = () => {
    router.push(`/casos`)
  }

  const canResolve = status === 'ABIERTO' || status === 'EN_PROCESO'
  const canReopen = status === 'RESUELTO' || status === 'CERRADO'
  const canClose = status === 'RESUELTO'
  const assignedUser = usuarios.find(u => u.id === asignadoAId)

  return (
    <Modal open={true} onClose={onClose} className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
      <div className="p-5 space-y-4">
        {/* Success header */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-semibold text-green-800">Caso creado exitosamente</span>
          </div>
        </div>

        {/* Case info */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${getBadgeColor(caso.severidad as any)}`}>
                {caso.severidad}
              </span>
              <span className="text-sm font-bold text-gray-800">{TIPO_LABELS[tipo] || tipo}</span>
            </div>
            {caso.cliente && (
              <p className="text-sm text-gray-600">{caso.cliente.nombre}</p>
            )}
            {caso.pedido && (
              <p className="text-xs text-gray-400">Pedido #{caso.pedido.numero}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Assignment */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-400">Asignado a</span>
              <p className="text-sm font-medium text-gray-700 mt-0.5">
                {assignedUser ? assignedUser.username : 'Sin asignar'}
              </p>
            </div>
            <button
              onClick={() => setShowAssign(!showAssign)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showAssign ? 'Cancelar' : 'Cambiar'}
            </button>
          </div>
          {showAssign && (
            <div className="mt-3 flex gap-2">
              <select
                value={asignadoAId}
                onChange={(e) => setAsignadoAId(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">Sin asignar</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.username} ({u.rol})</option>
                ))}
              </select>
              <button
                onClick={handleAssign}
                disabled={actionLoading === 'assign'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Asignar
              </button>
            </div>
          )}
        </div>

        {/* Checklist */}
        {soluciones.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">📋 Pasos sugeridos</h3>
            <div className="space-y-2">
              {soluciones.map((sol, idx) => (
                <label
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer ${
                    checkedSteps[idx]
                      ? 'bg-green-50 border-green-200'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedSteps[idx]}
                    onChange={() => toggleStep(idx)}
                    className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className={`text-sm ${checkedSteps[idx] ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                    {sol}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        {acciones.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">⚡ Acciones rápidas</h3>
            <div className="flex flex-wrap gap-2">
              {acciones.map((acc) => {
                const variantClass =
                  acc.variant === 'danger'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : acc.variant === 'secondary'
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                return (
                  <button
                    key={acc.accion}
                    onClick={() => handleAccion(acc.accion)}
                    disabled={actionLoading === acc.accion}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${variantClass}`}
                  >
                    {actionLoading === acc.accion ? '...' : acc.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Resolution notes */}
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1 block">
            📝 Notas de resolución
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
            placeholder="Describe cómo se resolvió este caso..."
          />
        </div>

        {/* Status buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {status === 'ABIERTO' && (
            <button
              onClick={() => handleStatusChange('EN_PROCESO')}
              disabled={actionLoading === 'status'}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              Tomar caso
            </button>
          )}
          {canResolve && (
            <button
              onClick={() => handleStatusChange('RESUELTO')}
              disabled={actionLoading === 'status'}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Resolver
            </button>
          )}
          {canClose && (
            <button
              onClick={() => handleStatusChange('CERRADO')}
              disabled={actionLoading === 'status'}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
            >
              Cerrar
            </button>
          )}
          {canReopen && (
            <button
              onClick={() => handleStatusChange('EN_PROCESO')}
              disabled={actionLoading === 'status'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Reabrir
            </button>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`rounded-lg p-3 text-sm ${
            toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
            toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {toast.message}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between pt-2 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition"
          >
            Cerrar
          </button>
          <button
            onClick={handleGoToCase}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Ir al caso →
          </button>
        </div>
      </div>
    </Modal>
  )
}
