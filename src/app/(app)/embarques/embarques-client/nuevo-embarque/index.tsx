'use client'

import { useEffect, useReducer, useState } from 'react'
import { Modal } from '@/components/modal'
import { generateUUID } from '@/lib/uuid'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import { horaActualBogota } from './defaults'
import { wizardReducer, initialState } from './wizard-reducer'
import { PasoPedidos } from './paso-pedidos'
import { PasoConfirmar } from './paso-confirmar'
import type { PedidoSeleccionable } from './filtrar-pedidos'
import type { Trabajador, Ruta } from '../types'

interface NuevoEmbarqueWizardProps {
  open: boolean
  onClose: () => void
  /** Llamado tras crear (para refrescar la lista de embarques). */
  onCreated: () => void
  trabajadores: Trabajador[]
  rutas: Ruta[]
}

/**
 * Wizard de "Nuevo Embarque" — flujo pedidos-primero.
 *
 * Paso 1: elegir pedidos → la carga se deriva sola.
 * Paso 2: confirmar (repartidor, carga editable, hora, base) → crea el embarque
 *         Y asigna los pedidos en un solo flujo (POST /api/embarques → PUT pedidoIds).
 *
 * Reemplaza `mode='create'` del `EmbarqueFormModal` legacy. La edición sigue en
 * `EditarEmbarqueModal`.
 */
export function NuevoEmbarqueWizard({ open, onClose, onCreated, trabajadores, rutas }: NuevoEmbarqueWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => initialState())
  const [offlineId, setOfflineId] = useState('')
  const [prevOpen, setPrevOpen] = useState(false)

  // Reinicio en render al abrir (no en efecto) — patrón react.dev.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setOfflineId(generateUUID())
      dispatch({ type: 'RESET', horaSalida: horaActualBogota() })
    }
  }

  // Carga de pedidos disponibles al abrir.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/pedidos?all=true', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const pedidos: PedidoSeleccionable[] = data?.pedidos ?? data?.data ?? []
        dispatch({ type: 'ORDERS_LOADED', pedidos })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'ORDERS_LOAD_ERROR' })
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Realtime: si otro asistente toma un pedido mientras el wizard está abierto,
  // refrescamos la lista y deseleccionamos lo que ya no está libre.
  useRealtimeListener(
    open ? ['pedido.updated', 'pedido.created', 'embarque.updated'] : [],
    () => {
      fetch('/api/pedidos?all=true', { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => {
          const pedidos: PedidoSeleccionable[] = data?.pedidos ?? data?.data ?? []
          dispatch({ type: 'REFRESH_PEDIDOS', pedidos })
        })
        .catch(() => {})
    },
    { debounceMs: 800 },
  )

  const handleClose = () => {
    dispatch({ type: 'RESET' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      data-testid="nuevo-embarque-wizard"
      className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
    >
      <div className="px-5 pt-5 pb-3 border-b flex items-center justify-between">
        <h2 className="text-xl font-bold">Nuevo Embarque</h2>
        <span className="text-xs text-gray-400" data-testid="wizard-fase">
          {state.fase === 'REVIEWING' || state.fase === 'SUBMITTING' ? 'Paso 2 de 2' : 'Paso 1 de 2'}
        </span>
      </div>

      {state.fase === 'ERROR' && state.data.pedidos.length === 0 ? (
        <div className="p-8 text-center space-y-3">
          <p className="text-sm text-gray-600">{state.error}</p>
          <button
            onClick={() => {
              dispatch({ type: 'RESET', horaSalida: horaActualBogota() })
              fetch('/api/pedidos?all=true', { credentials: 'include' })
                .then((r) => r.json())
                .then((d) => dispatch({ type: 'ORDERS_LOADED', pedidos: d?.pedidos ?? d?.data ?? [] }))
                .catch(() => dispatch({ type: 'ORDERS_LOAD_ERROR' }))
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
          >
            Reintentar
          </button>
        </div>
      ) : state.fase === 'REVIEWING' || state.fase === 'SUBMITTING' || state.fase === 'CREATED' || state.fase === 'ASSIGNING' || state.fase === 'SUCCESS' || state.fase === 'CONFLICT' || state.fase === 'OFFLINE_PENDING' ? (
        <PasoConfirmar
          state={state}
          dispatch={dispatch}
          trabajadores={trabajadores}
          rutas={rutas}
          offlineId={offlineId}
          onDone={(refetch) => {
            if (refetch) onCreated()
          }}
          onClose={handleClose}
        />
      ) : (
        <PasoPedidos state={state} dispatch={dispatch} onCancel={handleClose} />
      )}
    </Modal>
  )
}
