'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'
import { getProductoEmoji } from '@/hooks/use-productos-domicilio'
import { useStockDisponible, evaluarStockCarga } from '@/hooks/use-stock-disponible'
import { PRODUCTOS_CARGA, totalUnidadesCarga, type ProductoCarga } from './derivar-carga'
import { sugerirCapacidad } from './sugerir-capacidad'
import { encolarEmbarqueConPedidos } from './offline'
import type { WizardState, WizardAction } from './wizard-reducer'
import type { Trabajador, Ruta } from '../types'

interface PasoConfirmarProps {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
  trabajadores: Trabajador[]
  rutas: Ruta[]
  offlineId: string
  onDone: (refetch: boolean) => void
  onClose: () => void
}

const PROD_LABEL: Record<ProductoCarga, string> = {
  PACA_AGUA: 'Pacas agua',
  PACA_HIELO: 'Pacas hielo',
  BOTELLON: 'Botellones',
  BOLSA_AGUA: 'Bolsas agua',
  BOLSA_HIELO: 'Bolsas hielo',
}

interface EmbarqueCreado {
  embarque?: { id?: string; numero?: number }
}

export function PasoConfirmar({
  state,
  dispatch,
  trabajadores,
  rutas,
  offlineId,
  onDone,
  onClose,
}: PasoConfirmarProps) {
  const router = useRouter()
  const { data, fase } = state
  const { stockDisponible, tieneStockEstimado, maxUnidades } = useStockDisponible(true)
  const [showAvanzadas, setShowAvanzadas] = useState(false)
  const [showConfirm0, setShowConfirm0] = useState(false)

  const selectedTrabajador = trabajadores.find((t) => t.id === data.trabajadorId)
  const nPedidos = data.selectedIds.length
  const totalUnidades = totalUnidadesCarga(data.carga)

  const cap = sugerirCapacidad(data.carga, selectedTrabajador, trabajadores, maxUnidades)
  const stockEval = evaluarStockCarga(stockDisponible, data.carga)
  const bloqueaStock = !tieneStockEstimado && stockEval.hayStockInsuficiente && !data.confirmOverride

  const submitting = fase === 'SUBMITTING' || fase === 'CREATED' || fase === 'ASSIGNING'

  // ── Terminal states ───────────────────────────────────────────────────────

  if (fase === 'SUCCESS' || fase === 'CONFLICT' || fase === 'OFFLINE_PENDING') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center" data-testid="wizard-resultado">
        {fase === 'OFFLINE_PENDING' && (
          <>
            <span className="text-3xl">📡</span>
            <p className="text-sm text-gray-700">
              Sin conexión. El embarque y sus {nPedidos} pedido(s) se registrarán al
              recuperar la red. Si otro repartidor tomó alguno, te avisamos.
            </p>
          </>
        )}
        {fase === 'SUCCESS' && (
          <>
            <span className="text-3xl">✅</span>
            <p className="text-sm text-gray-700">
              Embarque creado{nPedidos > 0 ? ` con ${nPedidos} pedido(s)` : ''}.
            </p>
          </>
        )}
        {fase === 'CONFLICT' && (
          <div className="space-y-2" data-testid="conflict-notice">
            <span className="text-3xl">⚠️</span>
            <p className="text-sm text-gray-800 font-medium">El embarque se creó.</p>
            <p className="text-sm text-gray-600">
              Estos pedidos ya estaban en otro embarque y no se asignaron:
            </p>
            <p className="text-sm font-medium text-amber-700">
              {(state.noAsignados ?? []).join(', ') || '—'}
            </p>
            <p className="text-xs text-gray-500">Revisalos desde el detalle del embarque.</p>
          </div>
        )}
        <button
          onClick={() => {
            const id = state.embarqueId
            onClose()
            if (id) router.push(`/embarques/${id}`)
          }}
          data-testid="wizard-ir-detalle"
          className="px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {state.embarqueId ? 'Ir al detalle' : 'Cerrar'}
        </button>
      </div>
    )
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function crear() {
    dispatch({ type: 'SUBMIT_START' })

    const carga = PRODUCTOS_CARGA.filter((k) => (data.carga[k] || 0) > 0).map((producto) => ({
      producto,
      cargadas: data.carga[producto],
    }))
    if (carga.length === 0) {
      dispatch({ type: 'ERROR', message: 'Agregá al menos un producto a la carga.' })
      return
    }

    const body = {
      trabajadorId: data.trabajadorId,
      rutaId: data.rutaId || undefined,
      tipoMoto: data.tipoMoto || undefined,
      horaSalida: data.horaSalida,
      baseDinero: data.baseDinero,
      obs: data.obs || undefined,
      carga,
      overrideMotivo: data.overrideMotivo || undefined,
      offlineId,
    }

    const res = await fetchResilient<EmbarqueCreado>('/api/embarques', {
      method: 'POST',
      body,
      localEndpoint: 'crear-embarque',
    })

    if (res.status === 'offline') {
      await encolarEmbarqueConPedidos(body, data.selectedIds, offlineId)
      dispatch({ type: 'OFFLINE' })
      onDone(true)
      return
    }
    if (res.status === 'error') {
      dispatch({ type: 'ERROR', message: res.error || 'No se pudo crear el embarque.' })
      return
    }

    const embarqueId = res.data?.embarque?.id
    if (!embarqueId) {
      dispatch({ type: 'ERROR', message: 'El servidor no devolvió el embarque creado.' })
      return
    }
    dispatch({ type: 'CREATED', embarqueId })
    onDone(true)

    if (data.selectedIds.length === 0) {
      dispatch({ type: 'SUCCESS', embarqueId })
      return
    }

    // Asignación — raw fetch para inspeccionar el 409.
    dispatch({ type: 'ASSIGN_START' })
    try {
      const put = await fetch(`/api/embarques/${embarqueId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoIds: data.selectedIds, offlineId }),
      })
      if (put.status === 409) {
        const j = await put.json().catch(() => ({}))
        const msg: string = j?.error?.message ?? ''
        const idsMatch = msg.match(/embarque:\s*([^.]+)\./)
        const ids = idsMatch ? idsMatch[1].split(',').map((s) => s.trim()) : []
        const nombres = ids.map((id) => {
          const p = data.pedidos.find((x) => x.id === id)
          return p ? p.nombreNegocioCli || p.nombreCli || `#${p.numero}` : id
        })
        dispatch({ type: 'CONFLICT', embarqueId, noAsignados: nombres })
        return
      }
      if (!put.ok) {
        toast.warning('El embarque se creó pero no se pudieron asignar los pedidos. Asignalos desde el detalle.')
      }
      dispatch({ type: 'SUCCESS', embarqueId })
    } catch {
      toast.warning('El embarque se creó; asigná los pedidos desde el detalle.')
      dispatch({ type: 'SUCCESS', embarqueId })
    }
  }

  function onConfirmarClick() {
    if (nPedidos === 0) {
      setShowConfirm0(true)
      return
    }
    void crear()
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {state.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" data-testid="wizard-error">
            {state.error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Repartidor *</label>
          <select
            value={data.trabajadorId}
            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'trabajadorId', value: e.target.value })}
            data-testid="confirmar-repartidor"
            className="w-full p-2 border rounded-lg text-sm"
          >
            <option value="">Elegir repartidor…</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>

        {/* Carga derivada / editable */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Carga</h3>
            {data.cargaEditada && (
              <button
                onClick={() => dispatch({ type: 'RESTORE_CARGA' })}
                data-testid="restaurar-carga"
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Restaurar carga de los pedidos
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {PRODUCTOS_CARGA.map((k) => {
              const excede = stockEval.productosConDeficit.includes(k)
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-sm w-28">{getProductoEmoji(k)} {PROD_LABEL[k]}</span>
                  <input
                    type="number"
                    min={0}
                    value={data.carga[k] || 0}
                    onChange={(e) => dispatch({ type: 'SET_CARGA_ITEM', producto: k, value: parseInt(e.target.value) || 0 })}
                    onFocus={(e) => e.target.select()}
                    data-testid={`carga-${k}`}
                    className={`w-20 p-1 border rounded text-center text-sm ${excede ? 'border-red-400 bg-red-50' : ''}`}
                  />
                  {stockDisponible && (
                    <span className="text-xs text-gray-400">
                      stock {(stockDisponible as unknown as Record<string, number>)[k] ?? 0}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-500 mt-1">{totalUnidades} unidades · {Math.round(cap.pesoKg)} kg</p>
        </div>

        {/* Capacidad — advierte + sugiere, nunca bloquea */}
        {cap.nivel !== 'ok' && (
          <div
            className={`p-3 rounded-lg text-sm ${cap.nivel === 'excede' ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-yellow-50 text-yellow-700'}`}
            data-testid="capacidad-aviso"
          >
            <p className="font-medium">{cap.mensaje}</p>
            {cap.sugerencia && <p className="text-xs mt-0.5">{cap.sugerencia}</p>}
          </div>
        )}

        {/* Stock insuficiente + override */}
        {!tieneStockEstimado && stockEval.hayStockInsuficiente && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2" data-testid="stock-override">
            <p className="text-sm font-semibold text-red-800">⚠️ Stock insuficiente para la carga</p>
            <label className="flex items-start gap-2 text-sm text-red-800 cursor-pointer">
              <input
                type="checkbox"
                checked={data.confirmOverride}
                onChange={(e) => dispatch({ type: 'SET_CONFIRM_OVERRIDE', value: e.target.checked })}
                className="mt-0.5"
              />
              Confirmo que hay stock físico en zona de embarque
            </label>
            {stockEval.requiereMotivo && (
              <textarea
                value={data.overrideMotivo}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'overrideMotivo', value: e.target.value })}
                placeholder="Motivo (déficit > 10 unidades)"
                className="w-full px-2 py-1 border border-red-300 rounded text-sm"
                rows={2}
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora de salida</label>
            <input
              type="time"
              value={data.horaSalida}
              onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'horaSalida', value: e.target.value })}
              data-testid="confirmar-hora"
              className="w-full p-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base de dinero</label>
            <input
              type="number"
              min={0}
              value={data.baseDinero}
              onChange={(e) => dispatch({ type: 'SET_BASE', value: parseInt(e.target.value) || 0 })}
              onFocus={(e) => e.target.select()}
              data-testid="confirmar-base"
              placeholder="$0"
              className="w-full p-2 border rounded-lg text-sm"
            />
            {data.baseDinero === 0 && (
              <p className="text-xs text-amber-600 mt-1">Base en $0 — ¿seguro que no necesita cambio?</p>
            )}
          </div>
        </div>

        {/* Opciones avanzadas */}
        <div>
          <button
            onClick={() => setShowAvanzadas((v) => !v)}
            data-testid="mas-opciones"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {showAvanzadas ? '− ' : '+ '}Más opciones
          </button>
          {showAvanzadas && (
            <div className="mt-2 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ruta</label>
                <select
                  value={data.rutaId}
                  onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'rutaId', value: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  <option value="">Sin ruta</option>
                  {rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de moto</label>
                <input
                  type="text"
                  value={data.tipoMoto}
                  onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'tipoMoto', value: e.target.value })}
                  placeholder="Ej: moto carro grande"
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                <textarea
                  value={data.obs}
                  onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'obs', value: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t bg-gray-50 flex items-center gap-3">
        <button
          onClick={() => dispatch({ type: 'GOTO_ORDERS' })}
          disabled={submitting}
          className="px-4 py-2.5 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-50"
        >
          ← Volver
        </button>
        <div className="flex-1" />
        <button
          onClick={onConfirmarClick}
          disabled={!data.trabajadorId || submitting || bloqueaStock}
          data-testid="wizard-crear"
          className="px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creando…' : nPedidos > 0 ? `Crear embarque y asignar ${nPedidos} pedido(s)` : 'Crear embarque'}
        </button>
      </div>

      {showConfirm0 && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-6" data-testid="confirm-0-pedidos">
          <div className="bg-white rounded-xl p-5 max-w-sm space-y-3">
            <p className="text-sm text-gray-800">
              Vas a crear un embarque <strong>sin pedidos asignados</strong>. ¿Seguro?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm0(false)} className="flex-1 px-3 py-2 border rounded-lg text-sm">
                Cancelar
              </button>
              <button
                onClick={() => { setShowConfirm0(false); void crear() }}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
              >
                Crear igual
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
