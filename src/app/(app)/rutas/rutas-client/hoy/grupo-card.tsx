'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { fetchResilient } from '@/lib/fetch-resilient'
import type { PlanGrupo } from '../plan-types'

const CALIDAD_LABEL: Record<string, string> = {
  PRECISE: '',
  APPROX: 'ubicación aproximada',
  BARRIO_ONLY: 'solo barrio',
  NONE: 'sin ubicación',
}

export function GrupoCard({
  grupo,
  grupos,
  planId,
  expectedUpdatedAt,
  confirmado,
  onCambio,
}: {
  grupo: PlanGrupo
  grupos: PlanGrupo[]
  planId: string
  expectedUpdatedAt: string
  confirmado: boolean
  onCambio: () => void | Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [porque, setPorque] = useState(false)
  const [moviendo, setMoviendo] = useState<string | null>(null)

  const nPedidos = grupo.paradas.reduce(
    (s, p) => s + p.actividades.reduce((sa, a) => sa + a.pedidoIds.length, 0),
    0,
  )
  const otrosGrupos = grupos.filter((g) => g.id !== grupo.id && !g.embarqueId)

  async function moverParada(paradaId: string, grupoDestinoId: string) {
    setMoviendo(paradaId)
    const r = await fetchResilient(`/api/rutas/planes/${planId}`, {
      method: 'PATCH',
      body: { expectedUpdatedAt, op: { tipo: 'moverParada', paradaId, grupoDestinoId } },
      localEndpoint: 'rutas-plan-mover',
    })
    setMoviendo(null)
    if (r.status === 'ok') {
      toast.success('Parada movida')
      await onCambio()
    } else if (r.status === 'error' && r.statusCode === 409) {
      toast.error('El plan cambió. Recargá la página.')
    } else {
      toast.error('No se pudo mover la parada')
    }
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm" data-testid="rutas-grupo">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-start justify-between gap-3 p-4 text-left"
      >
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg">{grupo.nombreLogico}</h3>
            {grupo.embarqueId && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">embarcado</span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-0.5">
            {nPedidos} pedido{nPedidos !== 1 ? 's' : ''} · {grupo.paradas.length} parada
            {grupo.paradas.length !== 1 ? 's' : ''} · {grupo.capacidadUnidades} unidades
            {grupo.distanciaKm > 0 && ` · ~${grupo.distanciaKm} km`}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {grupo.trabajadorNombre ? `Repartidor: ${grupo.trabajadorNombre}` : 'Sin repartidor asignado'}
            {grupo.horaSalidaPropuesta && ` · sale ${grupo.horaSalidaPropuesta}`}
          </p>
        </div>
        <span className="text-gray-400 text-sm mt-1">{abierto ? '▲' : '▼'}</span>
      </button>

      {grupo.explicacion && (
        <div className="px-4 pb-2">
          <button onClick={() => setPorque((v) => !v)} className="text-xs text-blue-600 hover:underline">
            {porque ? 'Ocultar' : '¿Por qué?'}
          </button>
          {porque && (
            <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded p-2">
              {grupo.explicacion.texto}
              {grupo.explicacion.senales.length > 0 && (
                <span className="block mt-1 text-gray-400">Señales: {grupo.explicacion.senales.join(' · ')}</span>
              )}
            </p>
          )}
        </div>
      )}

      {abierto && (
        <ul className="border-t divide-y">
          {grupo.paradas.map((p) => {
            const cal = p.ubicacionUsada?.calidad
            const calTxt = cal && CALIDAD_LABEL[cal] ? CALIDAD_LABEL[cal] : ''
            const pedidos = p.actividades.reduce((s, a) => s + a.pedidoIds.length, 0)
            return (
              <li key={p.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="w-6 h-6 shrink-0 rounded-full bg-gray-100 text-gray-600 text-xs grid place-items-center">
                  {p.secuencia + 1}
                </span>
                <span className="flex-1 truncate">
                  {p.negocioNombre ?? p.clienteNombre ?? p.clienteId}
                  {calTxt && <span className="text-amber-600 text-xs ml-1">({calTxt})</span>}
                </span>
                <span className="text-gray-400 text-xs shrink-0">{pedidos} ped.</span>
                {!confirmado && otrosGrupos.length > 0 && (
                  <select
                    aria-label="Mover parada a otro grupo"
                    className="text-xs border rounded px-1 py-0.5 bg-white disabled:opacity-50"
                    disabled={moviendo === p.id}
                    value=""
                    onChange={(e) => e.target.value && moverParada(p.id, e.target.value)}
                  >
                    <option value="">Mover a…</option>
                    {otrosGrupos.map((g) => (
                      <option key={g.id} value={g.id}>{g.nombreLogico}</option>
                    ))}
                  </select>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
