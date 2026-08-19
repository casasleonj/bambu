'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'
import { generateUUID } from '@/lib/uuid'
import { BotellonIcon } from '@/components/icons/productos/botellon-icon'
import type { Movimiento } from './types'

interface BotellonesPanelProps {
  embarqueId: string
  movimientos: Movimiento[]
  onCreated: (movimiento: Movimiento) => void
  canRegister: boolean
}

export function BotellonesPanel({ embarqueId, movimientos, onCreated, canRegister }: BotellonesPanelProps) {
  const [accion, setAccion] = useState<'RECOGIDA' | 'ENTREGA' | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { recogidos, entregados } = useMemo(() => {
    let recogidos = 0
    let entregados = 0
    for (const m of movimientos) {
      if (m.producto !== 'BOTELLON') continue
      if (m.tipo === 'RETORNO' && m.destino === 'ALMACEN') recogidos += m.cantidad
      if (m.tipo === 'ENTREGA' && m.destino === 'CLIENTE') entregados += m.cantidad
    }
    return { recogidos, entregados }
  }, [movimientos])

  const enCustodia = recogidos - entregados

  const cantidadNum = Number(cantidad)
  const cantidadValida = Number.isInteger(cantidadNum) && cantidadNum > 0

  const handleSubmit = async () => {
    if (!accion || !cantidadValida || submitting) return
    setSubmitting(true)

    const offlineId = generateUUID()
    const result = await fetchResilient<{ movimiento: Movimiento }>(
      `/api/embarques/${embarqueId}/botellones`,
      {
        method: 'POST',
        body: { accion, cantidad: cantidadNum, offlineId },
        localEndpoint: 'embarque-botellones',
      }
    )

    if (result.status === 'offline') {
      toast.info('Sin conexión. Se registrará al recuperar la red.')
      setAccion(null)
      setCantidad('')
    } else if (result.status === 'error') {
      toast.error(result.error)
    } else {
      toast.success(accion === 'RECOGIDA' ? 'Recogida registrada' : 'Entrega registrada')
      onCreated(result.data.movimiento)
      setAccion(null)
      setCantidad('')
    }
    setSubmitting(false)
  }

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex items-center gap-2 mb-3">
        <BotellonIcon size={18} />
        <h3 className="text-sm font-semibold text-gray-800">Botellones</h3>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 rounded-lg bg-gray-50">
          <p className="text-lg font-bold text-gray-800">{recogidos}</p>
          <p className="text-[11px] text-gray-500">Recogidos</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-blue-50">
          <p className="text-lg font-bold text-blue-700">{enCustodia}</p>
          <p className="text-[11px] text-gray-500">En custodia</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-green-50">
          <p className="text-lg font-bold text-green-700">{entregados}</p>
          <p className="text-[11px] text-gray-500">Entregados</p>
        </div>
      </div>

      {!canRegister ? null : !accion ? (
        <div className="flex gap-2">
          <button
            data-testid="botellon-recogida-button"
            onClick={() => setAccion('RECOGIDA')}
            className="flex-1 min-h-[44px] px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition"
          >
            + Registrar recogida
          </button>
          <button
            data-testid="botellon-entrega-button"
            onClick={() => setAccion('ENTREGA')}
            className="flex-1 min-h-[44px] px-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition"
          >
            + Registrar entrega
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">
              Cantidad {accion === 'RECOGIDA' ? 'recogida' : 'entregada'}
            </label>
            <input
              type="number"
              min={1}
              autoFocus
              data-testid="botellon-cantidad-input"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <button
            data-testid="botellon-confirmar-button"
            onClick={handleSubmit}
            disabled={!cantidadValida || submitting}
            className="min-h-[44px] min-w-[44px] px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '...' : 'Confirmar'}
          </button>
          <button
            onClick={() => { setAccion(null); setCantidad('') }}
            disabled={submitting}
            className="min-h-[44px] min-w-[44px] px-3 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
