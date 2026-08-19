'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { fetchResilient } from '@/lib/fetch-resilient'
import { generateUUID } from '@/lib/uuid'
import { PRODUCTO_ICONOS } from '@/lib/producto-iconos'
import type { Movimiento } from './types'

const CUSTODIAS = ['VEHICULO', 'ALMACEN', 'INSPECCION', 'CLIENTE', 'PRODUCCION', 'DESCARTE', 'EXTERNO'] as const

const TIPOS = [
  { value: 'REEMPAQUE', label: 'Reempaque', help: 'Reclasifica unidades sin cambiar la cantidad total.' },
  { value: 'DESCARTE', label: 'Descarte', help: 'Sale definitivamente de custodia (producto dañado/vencido).' },
  { value: 'CUSTODY_TRANSFER', label: 'Transferencia de custodia', help: 'Mueve producto entre custodias sin afectar inventario neto.' },
  { value: 'AJUSTE_AUTORIZADO', label: 'Ajuste autorizado', help: 'Corrección manual — exige autorización explícita.' },
] as const

interface MovimientoFormModalProps {
  open: boolean
  onClose: () => void
  onCreated: (movimiento: Movimiento) => void
  embarqueId: string
}

export function MovimientoFormModal({ open, onClose, onCreated, embarqueId }: MovimientoFormModalProps) {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['value']>('REEMPAQUE')
  const [producto, setProducto] = useState('PACA_AGUA')
  const [cantidad, setCantidad] = useState('')
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [effect, setEffect] = useState<'INCREASE' | 'DECREASE'>('INCREASE')
  const [authorization, setAuthorization] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setTipo('REEMPAQUE')
    setProducto('PACA_AGUA')
    setCantidad('')
    setOrigen('')
    setDestino('')
    setEffect('INCREASE')
    setAuthorization('')
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const cantidadNum = Number(cantidad)
  const cantidadValida = Number.isInteger(cantidadNum) && cantidadNum > 0
  const requiereAutorizacion = tipo === 'AJUSTE_AUTORIZADO'
  const puedeEnviar = cantidadValida && (!requiereAutorizacion || authorization.trim().length > 0)

  const handleSubmit = async () => {
    if (!puedeEnviar || submitting) return
    setSubmitting(true)

    const offlineId = generateUUID()
    const result = await fetchResilient<{ movimiento: Movimiento }>(
      `/api/embarques/${embarqueId}/movimientos`,
      {
        method: 'POST',
        body: {
          tipo,
          producto,
          cantidad: cantidadNum,
          origen: origen || undefined,
          destino: destino || undefined,
          metadata: requiereAutorizacion ? { effect } : undefined,
          authorization: requiereAutorizacion ? authorization.trim() : undefined,
          offlineId,
        },
        localEndpoint: 'embarque-movimiento-fisico',
      }
    )

    if (result.status === 'offline') {
      toast.info('Sin conexión. El movimiento se registrará al recuperar la red.')
      handleClose()
    } else if (result.status === 'error') {
      toast.error(result.error)
    } else {
      toast.success('Movimiento registrado')
      onCreated(result.data.movimiento)
      handleClose()
    }
    setSubmitting(false)
  }

  return (
    <Modal open={open} onClose={handleClose} className="bg-white rounded-xl p-6 w-full max-w-lg">
      <h2 className="text-xl font-bold mb-1">Registrar movimiento físico</h2>
      <p className="text-sm text-gray-500 mb-4">Reempaque, descarte, transferencia de custodia o ajuste autorizado.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de movimiento</label>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS.map((t) => (
              <button
                key={t.value}
                type="button"
                data-testid={`movimiento-tipo-${t.value}`}
                onClick={() => setTipo(t.value)}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition ${
                  tipo === t.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <p className="font-medium">{t.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.help}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
            <select
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
              data-testid="movimiento-cantidad-input"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Origen (opcional)</label>
            <select data-testid="movimiento-origen-select" value={origen} onChange={(e) => setOrigen(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">—</option>
              {CUSTODIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Destino (opcional)</label>
            <select data-testid="movimiento-destino-select" value={destino} onChange={(e) => setDestino(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">—</option>
              {CUSTODIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {requiereAutorizacion && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Efecto</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEffect('INCREASE')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${effect === 'INCREASE' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200'}`}
                >
                  + Aumenta inventario
                </button>
                <button
                  type="button"
                  onClick={() => setEffect('DECREASE')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${effect === 'DECREASE' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200'}`}
                >
                  − Reduce inventario
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Autorización</label>
              <input
                type="text"
                value={authorization}
                onChange={(e) => setAuthorization(e.target.value)}
                placeholder="Motivo y quién autoriza este ajuste"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={handleClose} disabled={submitting} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
          Cancelar
        </button>
        <button
          data-testid="movimiento-submit-button"
          onClick={handleSubmit}
          disabled={!puedeEnviar || submitting}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Registrando...' : 'Registrar'}
        </button>
      </div>
    </Modal>
  )
}
