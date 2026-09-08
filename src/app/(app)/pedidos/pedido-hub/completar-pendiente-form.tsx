'use client'

import { useEffect, useState } from 'react'
import { N2Impacto } from './n2-impacto'
import { useGestionPendiente } from './use-gestion-pendiente'

const prod = (p: string) => p.replace(/_/g, ' ').toLowerCase()
type Modo = 'PUNTO' | 'DOMICILIO'

export interface CompletarPendienteFormProps {
  pedidoId: string
  /** canal original del pedido — se PROPONE como modo inicial (P5). */
  pedidoCanal: Modo
  producto: string
  remanente: number
  onCancel: () => void
  /** el peek se invalida/recarga tras la mutación. */
  onMutado: () => void
}

/**
 * Flujo "completar el pendiente" (plan Fase 5-ii, semántica B): el usuario
 * elige cantidad y modo → se **proyecta** el impacto (read-only) → revisa →
 * confirma. El backend revalida y recalcula todo en el commit.
 */
export function CompletarPendienteForm({
  pedidoId, pedidoCanal, producto, remanente, onCancel, onMutado,
}: CompletarPendienteFormProps) {
  const [cantidad, setCantidad] = useState(remanente)
  const [modo, setModo] = useState<Modo>(pedidoCanal)
  const [offlineMsg, setOfflineMsg] = useState(false)
  const g = useGestionPendiente(pedidoId, onMutado)

  // Proyecta ante cualquier cambio de cantidad/modo (semántica B).
  useEffect(() => {
    if (cantidad <= 0 || cantidad > remanente) { g.limpiar(); return }
    g.proyectar({ accion: 'gestionar', producto, cantidad, modoDestino: modo })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantidad, modo, producto, remanente])

  const puedeConfirmar =
    !g.confirmando &&
    (g.proyeccion?.allowedActions.includes('gestionar') ?? false)

  const confirmar = async () => {
    const r = await g.confirmarGestion({ producto, cantidad, modoInicial: modo })
    if (r.offline) setOfflineMsg(true)
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" data-testid="completar-pendiente-form">
      <div className="text-xs font-semibold text-gray-700">Completar: {prod(producto)}</div>

      <label className="mt-2 block text-[11px] text-gray-600">
        Cantidad (máx {remanente})
        <input
          type="number"
          min={1}
          max={remanente}
          value={cantidad || ''}
          onChange={(e) => setCantidad(Math.max(0, parseInt(e.target.value, 10) || 0))}
          data-testid="completar-cantidad"
          className="ml-2 w-16 rounded border border-gray-300 px-1.5 py-0.5 text-right"
        />
      </label>

      <div className="mt-2 text-[11px] text-gray-600">
        Modo
        <span className="ml-2 inline-flex gap-1">
          {(['DOMICILIO', 'PUNTO'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              data-testid={`completar-modo-${m}`}
              className={`rounded border px-2 py-0.5 ${modo === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
            >
              {m === 'DOMICILIO' ? 'Domicilio' : 'Punto'}
            </button>
          ))}
        </span>
        {modo === pedidoCanal && (
          <span className="ml-2 text-[10px] text-gray-400" data-testid="completar-modo-propuesto">Propuesto según el pedido original</span>
        )}
      </div>

      {g.proyectando && <p className="mt-2 text-[11px] text-gray-400" data-testid="completar-proyectando">Calculando impacto…</p>}
      {g.proyeccion && !g.proyectando && <div className="mt-2"><N2Impacto proyeccion={g.proyeccion} /></div>}
      {g.error && <p className="mt-2 text-[11px] text-amber-700" data-testid="completar-error">{g.error}</p>}
      {offlineMsg && <p className="mt-2 text-[11px] text-blue-700" data-testid="completar-offline">Sin conexión — se aplicará al recuperar la red.</p>}

      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={onCancel} className="text-[11px] text-gray-500">Cancelar</button>
        <button
          type="button"
          onClick={confirmar}
          disabled={!puedeConfirmar}
          data-testid="completar-confirmar"
          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {g.confirmando ? 'Aplicando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}
