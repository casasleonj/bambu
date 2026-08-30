'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { fetchResilient } from '@/lib/fetch-resilient'
import { generateUUID } from '@/lib/uuid'
import { PRODUCTO_ICONOS } from '@/lib/producto-iconos'
import { SustitucionEmbarqueSchema } from '@/lib/validators'
import type { PedidoOption } from '../ledger-client/types'

/**
 * Fase 6b — modal de alta de sustitución.
 *
 * "El cliente devolvió una unidad defectuosa y recibió una nueva": registra
 * una Sustitucion que produce 2 movimientos físicos separados (RETORNO
 * VEHICULO→INSPECCION + ENTREGA VEHICULO→CLIENTE). Cross-producto queda FUERA
 * de alcance (ADR-SUSTITUCION-001): el producto es el mismo para ambos lados.
 */

/**
 * Gating de la acción "Registrar sustitución": solo ADMIN/ASISTENTE y solo si
 * el embarque no está en un estado terminal (CERRADO/CANCELADO). Coincide con
 * la validación del backend (POST /api/embarques/[id]/sustituciones).
 */
export function puedeRegistrarSustitucion(
  role: string | null | undefined,
  estado: string,
): boolean {
  const canManage = role === 'ADMIN' || role === 'ASISTENTE'
  return canManage && (estado === 'ABIERTO' || estado === 'EN_RUTA')
}

interface SustitucionFormModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
  embarqueId: string
  pedidos: PedidoOption[]
}

export function SustitucionFormModal({
  open,
  onClose,
  onCreated,
  embarqueId,
  pedidos,
}: SustitucionFormModalProps) {
  const [producto, setProducto] = useState('PACA_AGUA')
  const [cantidad, setCantidad] = useState('')
  const [pedidoId, setPedidoId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // offlineId estable por apertura del modal (no por submit): un reintento
  // dentro de la misma sesión del modal reusa el mismo offlineId y el backend
  // deduplica (ADR-IDEMPOTENCIA-001). Se regenera cada vez que el modal abre.
  const [offlineId, setOfflineId] = useState('')
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setOfflineId(generateUUID())
  }

  const reset = () => {
    setProducto('PACA_AGUA')
    setCantidad('')
    setPedidoId('')
    setMotivo('')
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const cantidadNum = Number(cantidad)
  // Misma validación que el backend (SustitucionEmbarqueSchema): producto
  // min 1, cantidad entero positivo, motivo opcional ≤500. Zod cliente.
  const parseResult = SustitucionEmbarqueSchema.safeParse({
    producto,
    cantidad: cantidadNum,
    pedidoId: pedidoId || undefined,
    motivo: motivo.trim() || undefined,
  })
  const puedeEnviar = parseResult.success && !submitting

  const motivoValido = (motivo.trim() || '').length <= 500
  const cantidadValida = Number.isInteger(cantidadNum) && cantidadNum > 0

  const handleSubmit = async () => {
    if (!puedeEnviar || submitting) return
    setSubmitting(true)

    const result = await fetchResilient<{ sustitucion: unknown; deduped?: boolean }>(
      `/api/embarques/${embarqueId}/sustituciones`,
      {
        method: 'POST',
        body: {
          producto,
          cantidad: cantidadNum,
          pedidoId: pedidoId || undefined,
          motivo: motivo.trim() || undefined,
          offlineId,
        },
        localEndpoint: 'embarque-sustitucion',
      }
    )

    if (result.status === 'offline') {
      toast.info('Sin conexión. La sustitución se registrará al recuperar la red.')
      handleClose()
    } else if (result.status === 'error') {
      toast.error(result.error)
    } else {
      toast.success('Sustitución registrada (retorno + entrega)')
      onCreated()
      handleClose()
    }
    setSubmitting(false)
  }

  return (
    <Modal open={open} onClose={handleClose} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-1">Registrar sustitución</h2>
      <p className="text-sm text-gray-500 mb-4">
        El cliente devolvió una unidad defectuosa y recibió una nueva. Se registran
        dos movimientos: el retorno a inspección y la entrega de reemplazo.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
            <select
              data-testid="sustitucion-producto-select"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              {Object.entries(PRODUCTO_ICONOS).map(([code, cfg]) => (
                <option key={code} value={code}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
            <input
              type="number"
              min={1}
              data-testid="sustitucion-cantidad-input"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            {!cantidadValida && cantidad !== '' && (
              <p className="text-xs text-red-600 mt-1">Cantidad debe ser un entero mayor a 0.</p>
            )}
          </div>
        </div>

        {pedidos.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pedido asociado (opcional)</label>
            <select
              data-testid="sustitucion-pedido-select"
              value={pedidoId}
              onChange={(e) => setPedidoId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">—</option>
              {pedidos.map((p) => <option key={p.id} value={p.id}>#{p.numero}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional, ≤500)</label>
          <textarea
            data-testid="sustitucion-motivo-input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="¿Por qué se sustituyó esta unidad?"
            className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
          />
          {!motivoValido && (
            <p className="text-xs text-red-600 mt-1">El motivo no puede superar 500 caracteres.</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={handleClose} disabled={submitting} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
          Cancelar
        </button>
        <button
          data-testid="sustitucion-submit-button"
          onClick={handleSubmit}
          disabled={!puedeEnviar}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Guardando...' : 'Registrar sustitución'}
        </button>
      </div>
    </Modal>
  )
}
