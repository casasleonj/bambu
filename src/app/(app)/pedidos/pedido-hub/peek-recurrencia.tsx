'use client'

import { useState } from 'react'
import { RecurrenciaEditor } from './recurrencia-editor'
import type { PeekLayer2 } from './peek-cache'

const prod = (p: string) => p.replace(/_/g, ' ').toLowerCase()

function resumenProductos(items: Array<{ producto: string; cantidad: number }>): string {
  return items
    .filter((i) => i.cantidad > 0)
    .map((i) => `${i.cantidad} ${prod(i.producto)}`)
    .join(' · ')
}

/**
 * Indicador de "pedido habitual" en el peek (Fase 8 F8-i, blueprint §6.1).
 *
 * El usuario **nunca** ve la palabra "plantilla". Muestra qué se repite, cada
 * cuánto, y un acceso a "Ajustar" (que F8-iii wirea al editor). Si la
 * recurrencia está pausada, lo dice.
 */
export function PeekRecurrencia({
  recurrencia,
  onMutado,
}: {
  recurrencia: PeekLayer2['recurrencia']
  /** F8-iii: tras editar la recurrencia, recargar el peek. Sin esto → solo muestra. */
  onMutado?: () => void
}) {
  const [editando, setEditando] = useState(false)
  if (!recurrencia) return null
  const resumen = resumenProductos(recurrencia.productos)

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${recurrencia.activo ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
      data-testid="peek-recurrencia"
      data-activo={recurrencia.activo}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${recurrencia.activo ? 'text-blue-800' : 'text-gray-600'}`}>
          {recurrencia.activo ? '🔁 Pedido habitual' : '⏸ Pedido habitual (pausado)'}
        </span>
        {onMutado && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            data-testid="peek-recurrencia-ajustar"
            className="text-[11px] text-blue-600 hover:underline"
          >
            Ajustar
          </button>
        )}
      </div>
      <div className="mt-0.5 text-[11px] text-gray-700">
        {resumen ? `${resumen} · ` : ''}cada {recurrencia.cadaNDias} {recurrencia.cadaNDias === 1 ? 'día' : 'días'}
        {recurrencia.activo && recurrencia.proximaFecha && (
          <> · próximo {new Date(recurrencia.proximaFecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })}</>
        )}
      </div>

      {editando && onMutado && (
        <RecurrenciaEditor
          recurrencia={recurrencia}
          onCancel={() => setEditando(false)}
          onGuardado={() => { setEditando(false); onMutado() }}
        />
      )}
    </div>
  )
}
