'use client'

import { Modal } from '@/components/modal'
import type { AlertaTipo } from '@/lib/alertas-config'
import { getGuiaAlerta, getBadgeColor } from '@/lib/alertas-config'

interface GuiaAlertaModalProps {
  tipo: AlertaTipo | null
  open: boolean
  onClose: () => void
  onAccion?: (accion: string, contexto?: { pedidoId?: string; clienteId?: string }) => void
  contexto?: { pedidoId?: string; clienteId?: string }
}

export function GuiaAlertaModal({ tipo, open, onClose, onAccion, contexto }: GuiaAlertaModalProps) {
  if (!tipo) return null
  const guia = getGuiaAlerta(tipo)
  if (!guia) return null

  const handleAccion = (accion: string) => {
    onAccion?.(accion, contexto)
  }

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0">{guia.icono}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${getBadgeColor(guia.severidad)}`}>
                {guia.severidad}
              </span>
              <h2 className="text-lg font-bold text-gray-800">{guia.nombre}</h2>
            </div>
            <p className="text-xs text-gray-400">Alerta antifraude del sistema</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Definición */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">¿Qué es?</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{guia.definicion}</p>
        </div>

        {/* Cómo se aplica */}
        <div className="bg-gray-50 rounded-lg p-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">¿Cómo se aplica?</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{guia.comoSeAplica}</p>
        </div>

        {/* Ejemplos */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Ejemplos reales</h3>
          <div className="space-y-2">
            {guia.ejemplos.map((ej, i) => (
              <div key={i} className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800">
                <span className="font-bold text-blue-600 mr-1">Ej. {i + 1}:</span>
                {ej}
              </div>
            ))}
          </div>
        </div>

        {/* Soluciones */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Posibles soluciones</h3>
          <ul className="space-y-1.5">
            {guia.soluciones.map((sol, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                <span>{sol}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Acciones */}
        <div className="pt-2 border-t">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Acciones disponibles</h3>
          <div className="flex flex-wrap gap-2">
            {guia.acciones.map((acc) => {
              const variantClass =
                acc.variant === 'danger'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : acc.variant === 'secondary'
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              return (
                <button
                  key={acc.accion}
                  onClick={() => handleAccion(acc.accion)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${variantClass}`}
                >
                  {acc.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
