'use client'

import { useState } from 'react'

/**
 * #836 F2b — «＋ Programar entrega (fecha u hora)». Cerrado por defecto: sin tocarlo, el pedido se crea
 * como siempre. La hora solo ordena y agrupa la lista de entregas; no avisa ni bloquea.
 * Maqueta aprobada: docs/agentes/maquetas/836-programacion-entregas/ (05 y 06, pantalla 6).
 */
export function ProgramarEntrega({
  fecha, hora, onFecha, onHora, error, hoyBogota, disabled = false,
}: {
  fecha: string
  hora: string
  onFecha: (v: string) => void
  onHora: (v: string) => void
  error?: string | null
  hoyBogota: string
  disabled?: boolean
}) {
  const [abierto, setAbierto] = useState(Boolean(fecha || hora))
  return (
    <div className="bg-white border rounded-xl p-4" data-testid="programar-entrega">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        disabled={disabled}
        data-testid="programar-entrega-toggle"
        className="text-sm font-medium text-blue-600 hover:underline"
      >
        {abierto ? '− Programar entrega' : '＋ Programar entrega (fecha u hora)'}
      </button>
      {abierto && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-3">
            <label className="block min-w-[8rem] flex-1 text-xs font-medium text-gray-700">
              Fecha
              <input
                type="date" value={fecha} min={hoyBogota} disabled={disabled} onChange={(e) => onFecha(e.target.value)}
                data-testid="programar-fecha"
                className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
              />
              <span className="mt-0.5 block font-normal text-gray-500">Vacía = hoy.</span>
            </label>
            <label className="block min-w-[8rem] flex-1 text-xs font-medium text-gray-700">
              Hora acordada <span className="font-normal text-gray-500">(opcional)</span>
              <input
                type="time" value={hora} disabled={disabled} onChange={(e) => onHora(e.target.value)}
                data-testid="programar-hora"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Con hora, el pedido se ordena en la lista según qué tan cerca esté (hora de Bogotá). No impide registrar la entrega.
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700" data-testid="programar-error">{error}</p>}
    </div>
  )
}
