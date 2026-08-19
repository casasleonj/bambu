'use client'

import { useCallback, useEffect, useState } from 'react'
import { MovimientoTimeline } from './movimiento-timeline'
import { MovimientoFormModal } from './movimiento-form-modal'
import { RecoveryPanel } from './recovery-panel'
import { RecoveryFormModal } from './recovery-form-modal'
import { BotellonesPanel } from './botellones-panel'
import type { Movimiento, RecoveryDecision, PedidoOption } from './types'

interface LedgerTabProps {
  embarqueId: string
  canManage: boolean
  canRegisterBotellon: boolean
  pedidos: PedidoOption[]
}

export function LedgerTab({ embarqueId, canManage, canRegisterBotellon, pedidos }: LedgerTabProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [recovery, setRecovery] = useState<RecoveryDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showMovimientoModal, setShowMovimientoModal] = useState(false)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [movRes, recRes] = await Promise.all([
        fetch(`/api/embarques/${embarqueId}/movimientos`, { credentials: 'include' }),
        fetch(`/api/embarques/${embarqueId}/recovery`, { credentials: 'include' }),
      ])
      const movData = await movRes.json()
      const recData = await recRes.json()
      if (!movRes.ok || !movData.success) throw new Error(movData.error?.message || 'Error cargando movimientos')
      if (!recRes.ok || !recData.success) throw new Error(recData.error?.message || 'Error cargando recovery')
      setMovimientos(movData.movimientos || [])
      setRecovery(recData.recovery || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando el ledger físico')
    } finally {
      setLoading(false)
    }
  }, [embarqueId])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    load()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load])

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-gray-400">Cargando ledger físico...</div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600 mb-2">{error}</p>
        <button onClick={load} className="text-xs text-blue-600 hover:underline">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <BotellonesPanel
        embarqueId={embarqueId}
        movimientos={movimientos}
        onCreated={(m) => setMovimientos((prev) => [m, ...prev])}
        canRegister={canRegisterBotellon}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Movimientos físicos ({movimientos.length})</h3>
            {canManage && (
              <button
                onClick={() => setShowMovimientoModal(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
              >
                + Registrar
              </button>
            )}
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            <MovimientoTimeline movimientos={movimientos} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Sobrantes / Faltantes ({recovery.length})</h3>
            {canManage && (
              <button
                onClick={() => setShowRecoveryModal(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
              >
                + Nueva decisión
              </button>
            )}
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            <RecoveryPanel recovery={recovery} />
          </div>
        </div>
      </div>

      {canManage && (
        <>
          <MovimientoFormModal
            open={showMovimientoModal}
            onClose={() => setShowMovimientoModal(false)}
            onCreated={(m) => setMovimientos((prev) => [m, ...prev])}
            embarqueId={embarqueId}
          />
          <RecoveryFormModal
            open={showRecoveryModal}
            onClose={() => setShowRecoveryModal(false)}
            onCreated={load}
            embarqueId={embarqueId}
            movimientos={movimientos}
            recovery={recovery}
            pedidos={pedidos}
          />
        </>
      )}
    </div>
  )
}
