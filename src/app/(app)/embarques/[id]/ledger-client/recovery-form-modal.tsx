'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { fetchResilient } from '@/lib/fetch-resilient'
import { generateUUID } from '@/lib/uuid'
import { PRODUCTO_ICONOS } from '@/lib/producto-iconos'
import { TIPO_STYLES } from './movimiento-timeline'
import type { Movimiento, RecoveryDecision, RecoveryTipo, PedidoOption } from './types'

const ORIGEN_TIPOS_SOBRANTE = ['CARGA', 'RECARGA', 'CUSTODY_TRANSFER'] as const

interface RecoveryFormModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
  embarqueId: string
  movimientos: Movimiento[]
  recovery: RecoveryDecision[]
  pedidos: PedidoOption[]
}

function disponibleRestante(movimiento: Movimiento, recovery: RecoveryDecision[]): number {
  const aplicado = recovery
    .filter((r) => r.sourceEventId === movimiento.id)
    .reduce((sum, r) => sum + r.cantidadAplicada, 0)
  return movimiento.cantidad - aplicado
}

export function RecoveryFormModal({ open, onClose, onCreated, embarqueId, movimientos, recovery, pedidos }: RecoveryFormModalProps) {
  const [tipo, setTipo] = useState<RecoveryTipo>('SOBRANTE')
  const [sourceEventId, setSourceEventId] = useState('')
  const [producto, setProducto] = useState('PACA_AGUA')
  const [cantidad, setCantidad] = useState('')
  const [cantidadAplicada, setCantidadAplicada] = useState('')
  const [reason, setReason] = useState('')
  const [pedidoOrigenId, setPedidoOrigenId] = useState('')
  const [pedidoDestinoId, setPedidoDestinoId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const candidatosSobrante = useMemo(
    () =>
      movimientos
        .filter((m) => ORIGEN_TIPOS_SOBRANTE.includes(m.tipo as (typeof ORIGEN_TIPOS_SOBRANTE)[number]))
        .map((m) => ({ movimiento: m, disponible: disponibleRestante(m, recovery) }))
        .filter((c) => c.disponible > 0),
    [movimientos, recovery]
  )

  const sourceSeleccionado = candidatosSobrante.find((c) => c.movimiento.id === sourceEventId)

  const reset = () => {
    setTipo('SOBRANTE')
    setSourceEventId('')
    setProducto('PACA_AGUA')
    setCantidad('')
    setCantidadAplicada('')
    setReason('')
    setPedidoOrigenId('')
    setPedidoDestinoId('')
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const cantidadNum = Number(cantidad)
  const cantidadAplicadaNum = Number(cantidadAplicada)
  const cantidadValida = Number.isInteger(cantidadNum) && cantidadNum > 0
  const cantidadAplicadaValida =
    Number.isInteger(cantidadAplicadaNum) && cantidadAplicadaNum >= 0 && cantidadAplicadaNum <= cantidadNum
  const sobranteValido = tipo === 'FALTANTE' || (sourceEventId.length > 0 && cantidadAplicadaNum <= (sourceSeleccionado?.disponible ?? 0))
  const puedeEnviar = cantidadValida && cantidadAplicadaValida && sobranteValido && reason.trim().length > 0

  const handleSubmit = async () => {
    if (!puedeEnviar || submitting) return
    setSubmitting(true)

    const offlineId = generateUUID()
    const result = await fetchResilient<{ decisionId: string; deduped: boolean }>(
      `/api/embarques/${embarqueId}/recovery`,
      {
        method: 'POST',
        body: {
          tipo,
          sourceEventId: tipo === 'SOBRANTE' ? sourceEventId : undefined,
          producto,
          cantidad: cantidadNum,
          cantidadAplicada: cantidadAplicadaNum,
          reason: reason.trim(),
          pedidoOrigenId: pedidoOrigenId || undefined,
          pedidoDestinoId: pedidoDestinoId || undefined,
          offlineId,
        },
        localEndpoint: 'embarque-recovery-decision',
      }
    )

    if (result.status === 'offline') {
      toast.info('Sin conexión. La decisión se registrará al recuperar la red.')
      handleClose()
    } else if (result.status === 'error') {
      toast.error(result.error)
    } else {
      toast.success(tipo === 'SOBRANTE' ? 'Sobrante resuelto' : 'Faltante registrado')
      onCreated()
      handleClose()
    }
    setSubmitting(false)
  }

  return (
    <Modal open={open} onClose={handleClose} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-1">Resolver sobrante o faltante</h2>
      <p className="text-sm text-gray-500 mb-4">
        Un sobrante tiene una unidad física de origen que se puede reasignar. Un faltante es una discrepancia sin origen físico.
      </p>

      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="recovery-tipo-sobrante"
            onClick={() => setTipo('SOBRANTE')}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium ${tipo === 'SOBRANTE' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200'}`}
          >
            Sobrante
          </button>
          <button
            type="button"
            data-testid="recovery-tipo-faltante"
            onClick={() => setTipo('FALTANTE')}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium ${tipo === 'FALTANTE' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200'}`}
          >
            Faltante
          </button>
        </div>

        {tipo === 'SOBRANTE' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Movimiento de origen</label>
            {candidatosSobrante.length === 0 ? (
              <p className="text-sm text-gray-400 italic px-3 py-2 border rounded-lg">
                No hay movimientos con unidades disponibles todavía.
              </p>
            ) : (
              <select
                data-testid="recovery-source-select"
                value={sourceEventId}
                onChange={(e) => setSourceEventId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Seleccionar...</option>
                {candidatosSobrante.map(({ movimiento, disponible }) => (
                  <option key={movimiento.id} value={movimiento.id}>
                    {TIPO_STYLES[movimiento.tipo]?.label ?? movimiento.tipo} · {getProductoLabel(movimiento.producto)} · disponible: {disponible} de {movimiento.cantidad}
                  </option>
                ))}
              </select>
            )}
            {sourceSeleccionado && (
              <p className="text-xs text-green-700 mt-1.5">
                Disponible restante: <strong>{sourceSeleccionado.disponible}</strong> unidades
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
            <select value={producto} onChange={(e) => setProducto(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              {Object.entries(PRODUCTO_ICONOS).map(([code, cfg]) => (
                <option key={code} value={code}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad solicitada</label>
            <input
              type="number"
              min={1}
              data-testid="recovery-cantidad-input"
              value={cantidad}
              onChange={(e) => {
                setCantidad(e.target.value)
                if (!cantidadAplicada) setCantidadAplicada(e.target.value)
              }}
              placeholder="0"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad a aplicar ahora</label>
          <input
            type="number"
            min={0}
            data-testid="recovery-cantidad-aplicada-input"
            max={tipo === 'SOBRANTE' ? sourceSeleccionado?.disponible : undefined}
            value={cantidadAplicada}
            onChange={(e) => setCantidadAplicada(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          {!cantidadAplicadaValida && cantidadAplicada !== '' && (
            <p className="text-xs text-red-600 mt-1">La cantidad aplicada no puede exceder la solicitada.</p>
          )}
        </div>

        {pedidos.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pedido origen (opcional)</label>
              <select value={pedidoOrigenId} onChange={(e) => setPedidoOrigenId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">—</option>
                {pedidos.map((p) => <option key={p.id} value={p.id}>#{p.numero}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pedido destino (opcional)</label>
              <select value={pedidoDestinoId} onChange={(e) => setPedidoDestinoId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">—</option>
                {pedidos.map((p) => <option key={p.id} value={p.id}>#{p.numero}</option>)}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
          <textarea
            data-testid="recovery-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={tipo === 'SOBRANTE' ? '¿Por qué quedó esta cantidad disponible?' : '¿Por qué falta esta cantidad?'}
            className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={handleClose} disabled={submitting} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
          Cancelar
        </button>
        <button
          data-testid="recovery-submit-button"
          onClick={handleSubmit}
          disabled={!puedeEnviar || submitting}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Guardando...' : 'Registrar decisión'}
        </button>
      </div>
    </Modal>
  )
}

function getProductoLabel(codigo: string): string {
  return PRODUCTO_ICONOS[codigo]?.label ?? codigo
}
