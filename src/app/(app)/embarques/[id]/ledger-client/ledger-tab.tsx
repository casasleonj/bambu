'use client'

import { useCallback, useEffect, useState } from 'react'
import { MovimientoTimeline } from './movimiento-timeline'
import { MovimientoFormModal } from './movimiento-form-modal'
import { RecoveryPanel } from './recovery-panel'
import { RecoveryFormModal } from './recovery-form-modal'
import { BotellonesPanel } from './botellones-panel'
import { SustitucionesList } from '../mission-detail/sustituciones-list'
import { SustitucionFormModal } from '../mission-detail/sustitucion-form-modal'
import type { Movimiento, RecoveryDecision, PedidoOption } from './types'
import type { SustitucionUI } from '../mission-detail/sustituciones-list'

interface LedgerTabProps {
  embarqueId: string
  canManage: boolean
  canRegisterBotellon: boolean
  canRegisterSustitucion: boolean
  pedidos: PedidoOption[]
}

export function LedgerTab({ embarqueId, canManage, canRegisterBotellon, canRegisterSustitucion, pedidos }: LedgerTabProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [recovery, setRecovery] = useState<RecoveryDecision[]>([])
  const [sustituciones, setSustituciones] = useState<SustitucionUI[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showMovimientoModal, setShowMovimientoModal] = useState(false)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [showSustitucionModal, setShowSustitucionModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [movRes, recRes, susRes] = await Promise.all([
        fetch(`/api/embarques/${embarqueId}/movimientos`, { credentials: 'include' }),
        fetch(`/api/embarques/${embarqueId}/recovery`, { credentials: 'include' }),
        fetch(`/api/embarques/${embarqueId}/sustituciones`, { credentials: 'include' }),
      ])
      const movData = await movRes.json()
      const recData = await recRes.json()
      const susData = await susRes.json()
      if (!movRes.ok || !movData.success) throw new Error(movData.error?.message || 'Error cargando movimientos')
      if (!recRes.ok || !recData.success) throw new Error(recData.error?.message || 'Error cargando recovery')
      if (!susRes.ok || !susData.success) throw new Error(susData.error?.message || 'Error cargando sustituciones')
      setMovimientos(movData.movimientos || [])
      setRecovery(recData.recovery || [])
      setSustituciones(susData.sustituciones || [])
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
    <div data-testid="tab-fisico-panel" className="p-4 space-y-4">
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
                data-testid="registrar-movimiento-button"
                onClick={() => setShowMovimientoModal(true)}
                className="min-h-[44px] flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium px-3 rounded hover:bg-blue-50"
              >
                + Registrar
              </button>
            )}
          </div>
          <div data-testid="movimientos-timeline" className="max-h-[28rem] overflow-y-auto">
            <MovimientoTimeline movimientos={movimientos} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Sobrantes / Faltantes ({recovery.length})</h3>
            {canManage && (
              <button
                data-testid="nueva-recovery-decision-button"
                onClick={() => setShowRecoveryModal(true)}
                className="min-h-[44px] flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium px-3 rounded hover:bg-blue-50"
              >
                + Nueva decisión
              </button>
            )}
          </div>
          <div data-testid="recovery-panel" className="max-h-[28rem] overflow-y-auto">
            <RecoveryPanel recovery={recovery} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Sustituciones ({sustituciones.length})</h3>
          {canRegisterSustitucion && (
            <button
              data-testid="registrar-sustitucion-button"
              onClick={() => setShowSustitucionModal(true)}
              className="min-h-[44px] flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium px-3 rounded hover:bg-blue-50"
            >
              + Registrar sustitución
            </button>
          )}
        </div>
        <div data-testid="sustituciones-list" className="max-h-[28rem] overflow-y-auto">
          <SustitucionesList sustituciones={sustituciones} />
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
          <SustitucionFormModal
            open={showSustitucionModal}
            onClose={() => setShowSustitucionModal(false)}
            onCreated={load}
            embarqueId={embarqueId}
            pedidos={pedidos}
          />
        </>
      )}
    </div>
  )
}
