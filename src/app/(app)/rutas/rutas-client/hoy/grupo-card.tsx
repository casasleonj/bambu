'use client'

import { useState } from 'react'
import type { PlanGrupo } from '../plan-types'

const CALIDAD_LABEL: Record<string, string> = {
  PRECISE: '',
  APPROX: 'ubicación aproximada',
  BARRIO_ONLY: 'solo barrio',
  NONE: 'sin ubicación',
}

export function GrupoCard({ grupo, confirmado }: { grupo: PlanGrupo; confirmado: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [porque, setPorque] = useState(false)

  const nPedidos = grupo.paradas.reduce(
    (s, p) => s + p.actividades.reduce((sa, a) => sa + a.pedidoIds.length, 0),
    0,
  )

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
            {grupo.distanciaKm != null && grupo.distanciaKm > 0 && ` · ~${grupo.distanciaKm} km`}
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
          <button
            onClick={() => setPorque((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            {porque ? 'Ocultar' : '¿Por qué?'}
          </button>
          {porque && (
            <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded p-2">
              {grupo.explicacion.texto}
              {grupo.explicacion.senales.length > 0 && (
                <span className="block mt-1 text-gray-400">
                  Señales: {grupo.explicacion.senales.join(' · ')}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {abierto && (
        <ol className="border-t divide-y">
          {grupo.paradas.map((p) => {
            const cal = p.ubicacionUsada?.calidad
            const calTxt = cal && CALIDAD_LABEL[cal] ? CALIDAD_LABEL[cal] : ''
            const pedidos = p.actividades.reduce((s, a) => s + a.pedidoIds.length, 0)
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-6 h-6 shrink-0 rounded-full bg-gray-100 text-gray-600 text-xs grid place-items-center">
                  {p.secuencia + 1}
                </span>
                <span className="flex-1 truncate">
                  {p.negocioNombre ?? p.clienteNombre ?? p.clienteId}
                  {calTxt && <span className="text-amber-600 text-xs ml-1">({calTxt})</span>}
                </span>
                <span className="text-gray-400 text-xs">{pedidos} pedido{pedidos !== 1 ? 's' : ''}</span>
              </li>
            )
          })}
        </ol>
      )}
      {!confirmado && abierto && (
        <p className="px-4 py-2 text-xs text-gray-400 border-t">
          Para mover pedidos entre grupos usá el detalle del grupo (próximamente).
        </p>
      )}
    </div>
  )
}
