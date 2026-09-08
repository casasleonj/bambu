'use client'

import { useEffect, useState } from 'react'
import { N2Impacto } from './n2-impacto'
import { useGestionPendiente } from './use-gestion-pendiente'

type Modo = 'PUNTO' | 'DOMICILIO'

export interface ActividadAccionesProps {
  pedidoId: string
  actividadId: string
  modoActual: Modo | null
  accion: 'cambiar-modo' | 'liberar'
  onCancel: () => void
  onMutado: () => void
}

/**
 * Acciones sobre una Actividad N2 (plan Fase 5-iii): cambiar modo / liberar,
 * ambas con **consecuencia económica explícita** (P3). Se proyecta el impacto
 * (read-only) antes de decidir; `liberar` exige motivo (min 1).
 */
export function ActividadAcciones({
  pedidoId, actividadId, modoActual, accion, onCancel, onMutado,
}: ActividadAccionesProps) {
  const otro: Modo = modoActual === 'PUNTO' ? 'DOMICILIO' : 'PUNTO'
  const [modoDestino, setModoDestino] = useState<Modo>(otro)
  const [motivo, setMotivo] = useState('')
  const [offlineMsg, setOfflineMsg] = useState(false)
  const g = useGestionPendiente(pedidoId, onMutado)

  useEffect(() => {
    if (accion === 'liberar') {
      g.proyectar({ accion: 'liberar', actividadId })
    } else {
      g.proyectar({ accion: 'cambiar-modo', actividadId, modoDestino })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accion, actividadId, modoDestino])

  const permitido = accion === 'liberar'
    ? (g.proyeccion?.allowedActions.includes('liberar') ?? false)
    : (g.proyeccion?.allowedActions.includes('cambiar-modo') ?? false)
  const puedeConfirmar = !g.confirmando && permitido && (accion !== 'liberar' || motivo.trim().length > 0)

  const confirmar = async () => {
    const r = accion === 'liberar'
      ? await g.confirmarLiberar({ actividadId, motivo: motivo.trim() })
      : await g.confirmarCambioModo({ actividadId, modoDestino })
    if (r.offline) setOfflineMsg(true)
  }

  return (
    <div className="mt-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[11px]" data-testid={`actividad-acciones-${accion}`}>
      <div className="text-xs font-semibold text-gray-700">
        {accion === 'liberar' ? 'Liberar esta gestión' : 'Cambiar el modo de esta actividad'}
      </div>

      {accion === 'cambiar-modo' && (
        <div className="mt-1.5 text-gray-600">
          Modo destino
          <span className="ml-2 inline-flex gap-1">
            {(['DOMICILIO', 'PUNTO'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModoDestino(m)}
                data-testid={`actividad-modo-${m}`}
                className={`rounded border px-2 py-0.5 ${modoDestino === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
              >
                {m === 'DOMICILIO' ? 'Domicilio' : 'Punto'}
              </button>
            ))}
          </span>
        </div>
      )}

      {g.proyectando && <p className="mt-1.5 text-gray-400" data-testid="actividad-proyectando">Calculando impacto…</p>}
      {g.proyeccion && !g.proyectando && <div className="mt-1.5"><N2Impacto proyeccion={g.proyeccion} /></div>}
      {g.error && <p className="mt-1.5 text-amber-700" data-testid="actividad-error">{g.error}</p>}
      {offlineMsg && <p className="mt-1.5 text-blue-700" data-testid="actividad-offline">Sin conexión — se aplicará al recuperar la red.</p>}

      {accion === 'liberar' && (
        <label className="mt-1.5 block text-gray-600">
          Motivo (obligatorio)
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            data-testid="liberar-motivo"
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1"
            placeholder="Por qué se libera esta gestión"
          />
        </label>
      )}

      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" onClick={onCancel} className="text-gray-500">Cancelar</button>
        <button
          type="button"
          onClick={confirmar}
          disabled={!puedeConfirmar}
          data-testid="actividad-confirmar"
          className={`rounded-lg px-3 py-1 text-xs font-medium text-white disabled:opacity-40 ${accion === 'liberar' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {g.confirmando ? 'Aplicando…' : (accion === 'liberar' ? 'Liberar' : 'Cambiar modo')}
        </button>
      </div>
    </div>
  )
}
