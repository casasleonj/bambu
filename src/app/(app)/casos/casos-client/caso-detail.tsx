'use client'

import { useState } from 'react'

interface Caso {
  id: string
  alertaTipo: string
  severidad: string
  titulo: string
  descripcion: string | null
  clienteId: string | null
  pedidoId: string | null
  status: string
  asignadoAId: string | null
  creadoPorId: string
  notasResolucion: string | null
  resueltoEn: string | null
  cerradoEn: string | null
  createdAt: string
  updatedAt: string
  cliente: { id: string; nombre: string; telefono: string } | null
  pedido: { id: string; numero: number; total: number } | null
  asignadoA: { id: string; username: string } | null
  creadoPor: { id: string; username: string } | null
  _count: { eventos: number }
  eventos?: Array<{
    id: string
    accion: string
    valorPre: string | null
    valorPost: string | null
    comentario: string | null
    createdAt: string
    user: { id: string; username: string }
  }>
}

interface Usuario {
  id: string
  username: string
  rol: string
}

interface CasoDetailProps {
  caso: Caso
  usuarios: Usuario[]
  onClose: () => void
  onStatusChange: (casoId: string, newStatus: string) => void
}

const STATUS_LABELS: Record<string, string> = {
  ABIERTO: 'Abierto',
  EN_PROCESO: 'En Proceso',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
}

const STATUS_COLORS: Record<string, string> = {
  ABIERTO: 'bg-red-100 text-red-700 border-red-200',
  EN_PROCESO: 'bg-amber-100 text-amber-700 border-amber-200',
  RESUELTO: 'bg-green-100 text-green-700 border-green-200',
  CERRADO: 'bg-gray-100 text-gray-600 border-gray-200',
}

const SEVERIDAD_COLORS: Record<string, string> = {
  ALTA: 'bg-red-100 text-red-700 border-red-200',
  MEDIA: 'bg-amber-100 text-amber-700 border-amber-200',
  BAJA: 'bg-blue-100 text-blue-700 border-blue-200',
}

const ACCION_LABELS: Record<string, string> = {
  creado: 'Creado',
  asignado: 'Asignado',
  comentado: 'Comentario',
  status_change: 'Cambio de estado',
}

function formatFecha(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function CasoDetail({ caso, usuarios, onClose, onStatusChange }: CasoDetailProps) {
  const [status, setStatus] = useState(caso.status)
  const [asignadoAId, setAsignadoAId] = useState(caso.asignadoAId || '')
  const [notas, setNotas] = useState(caso.notasResolucion || '')
  const [comentario, setComentario] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canResolve = status === 'ABIERTO' || status === 'EN_PROCESO'
  const canReopen = status === 'RESUELTO' || status === 'CERRADO'
  const canClose = status === 'RESUELTO'

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === 'RESUELTO' && !notas.trim()) {
      setError('Las notas de resolución son requeridas para resolver un caso')
      return
    }

    setLoading(true)
    setError(null)

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
      if (!data.success) {
        setError(data.error?.message || 'Error actualizando caso')
        return
      }

      setStatus(newStatus)
      onStatusChange(caso.id, newStatus)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/casos/${caso.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asignadoAId: asignadoAId || null,
        }),
      })

      const data = await res.json()
      if (!data.success) {
        setError(data.error?.message || 'Error asignando caso')
        return
      }

      setAsignadoAId(data.caso.asignadoAId || '')
      setShowAssign(false)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const handleComentar = async () => {
    if (!comentario.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/casos/${caso.id}/eventos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'comentado',
          comentario,
        }),
      })

      const data = await res.json()
      if (!data.success) {
        setError(data.error?.message || 'Error agregando comentario')
        return
      }

      if (caso.eventos) {
        caso.eventos.push(data.evento)
      }
      setComentario('')
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const assignedUser = usuarios.find(u => u.id === asignadoAId)

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${SEVERIDAD_COLORS[caso.severidad]}`}>
              {caso.severidad}
            </span>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${STATUS_COLORS[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <h2 className="text-lg font-bold text-gray-800">{caso.titulo}</h2>
          {caso.descripcion && (
            <p className="text-sm text-gray-500 mt-1">{caso.descripcion}</p>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 rounded-lg p-3">
          <span className="text-xs text-gray-400">Cliente</span>
          <div className="font-medium text-gray-700 mt-0.5">
            {caso.cliente ? caso.cliente.nombre : '—'}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <span className="text-xs text-gray-400">Pedido</span>
          <div className="font-medium text-gray-700 mt-0.5">
            {caso.pedido ? `#${caso.pedido.numero}` : '—'}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <span className="text-xs text-gray-400">Asignado a</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-medium text-gray-700">
              {assignedUser ? assignedUser.username : 'Sin asignar'}
            </span>
            <button
              onClick={() => setShowAssign(!showAssign)}
              className="text-xs text-blue-600 hover:underline"
            >
              Cambiar
            </button>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <span className="text-xs text-gray-400">Creado</span>
          <div className="font-medium text-gray-700 mt-0.5">
            {formatFecha(caso.createdAt)}
          </div>
        </div>
      </div>

      {/* Assign dropdown */}
      {showAssign && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <label className="text-xs font-medium text-blue-700 mb-1 block">Asignar a:</label>
          <div className="flex gap-2">
            <select
              value={asignadoAId}
              onChange={(e) => setAsignadoAId(e.target.value)}
              className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-sm bg-white"
            >
              <option value="">Sin asignar</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.username} ({u.rol})</option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Asignar
            </button>
          </div>
        </div>
      )}

      {/* Resolution notes */}
      {(status === 'EN_PROCESO' || status === 'RESUELTO') && (
        <div>
          <label className="text-sm font-semibold text-gray-700 mb-1 block">
            Notas de resolución {status === 'RESUELTO' && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
            placeholder="Describe cómo se resolvió este caso..."
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {status === 'ABIERTO' && (
          <button
            onClick={() => handleStatusChange('EN_PROCESO')}
            disabled={loading}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            Tomar caso
          </button>
        )}
        {canResolve && (
          <button
            onClick={() => handleStatusChange('RESUELTO')}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Resolver
          </button>
        )}
        {canClose && (
          <button
            onClick={() => handleStatusChange('CERRADO')}
            disabled={loading}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            Cerrar
          </button>
        )}
        {canReopen && (
          <button
            onClick={() => handleStatusChange('EN_PROCESO')}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Reabrir
          </button>
        )}
      </div>

      {/* Comment section */}
      <div className="pt-2 border-t">
        <label className="text-sm font-semibold text-gray-700 mb-2 block">Agregar comentario</label>
        <div className="flex gap-2">
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
            placeholder="Escribe un comentario..."
          />
          <button
            onClick={handleComentar}
            disabled={loading || !comentario.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 self-end"
          >
            Enviar
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Timeline */}
      {caso.eventos && caso.eventos.length > 0 && (
        <div className="pt-2 border-t">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Historial</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {caso.eventos.map((evento) => (
              <div key={evento.id} className="flex gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">{evento.user.username}</span>
                    <span className="text-xs text-gray-400">{formatFecha(evento.createdAt)}</span>
                  </div>
                  <div className="text-gray-600">
                    {evento.accion === 'status_change' ? (
                      <span>
                        Cambió estado:{' '}
                        <span className="text-gray-400 line-through">{evento.valorPre}</span>
                        {' → '}
                        <span className="font-medium">{evento.valorPost}</span>
                      </span>
                    ) : evento.accion === 'asignado' ? (
                      <span>Asignado a: {evento.valorPost}</span>
                    ) : evento.comentario ? (
                      <span>{evento.comentario}</span>
                    ) : (
                      <span>{ACCION_LABELS[evento.accion] || evento.accion}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
