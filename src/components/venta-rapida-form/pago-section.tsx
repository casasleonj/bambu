'use client'

import { METODOS_PAGO, METODO_PAGO_ICONS } from '@/lib/metodos-pago'

interface PagoSectionProps {
  pagos: { metodo: string; monto: number }[]
  setPagos: React.Dispatch<React.SetStateAction<{ metodo: string; monto: number }[]>>
  modoPagoActivo: string | null
  setModoPagoActivo: React.Dispatch<React.SetStateAction<string | null>>
  montoInput: string
  setMontoInput: React.Dispatch<React.SetStateAction<string>>
  total: number
  totalPagado: number
  saldoPendiente: number
  metodosUsados: Set<string>
  seleccionarChip: (metodoId: string) => void
  confirmarMonto: () => void
  cancelarMonto: () => void
  eliminarPago: (idx: number) => void
  pagarCompleto: () => void
}

export function PagoSection({
  pagos,
  modoPagoActivo,
  montoInput,
  setMontoInput,
  total,
  totalPagado,
  saldoPendiente,
  metodosUsados,
  seleccionarChip,
  confirmarMonto,
  cancelarMonto,
  eliminarPago,
  pagarCompleto,
}: PagoSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700">Pagos</label>
        <button
          type="button"
          onClick={pagarCompleto}
          disabled={total <= 0}
          className="text-xs text-green-600 hover:text-green-700 disabled:text-gray-300 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-green-50 transition"
        >
          Pagar completo
        </button>
      </div>

      {/* Modo edición: chip seleccionado con input de monto */}
      {modoPagoActivo ? (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
          <span className="text-lg">{METODO_PAGO_ICONS[modoPagoActivo]}</span>
          <span className="text-sm font-medium text-gray-700">
            {METODOS_PAGO.find(m => m.id === modoPagoActivo)?.nombre}
          </span>
          <div className="flex-1 flex items-center gap-1 ml-2">
            <span className="text-xs text-gray-400">$</span>
            <input
              type="number"
              min="0"
              autoFocus
              value={montoInput}
              onChange={(e) => setMontoInput(e.target.value)}
              onBlur={confirmarMonto}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmarMonto()
                } else if (e.key === 'Escape') {
                  cancelarMonto()
                }
              }}
              className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="0"
            />
          </div>
          <button
            type="button"
            onClick={cancelarMonto}
            className="text-gray-400 hover:text-red-500 p-1 transition"
            title="Cancelar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        /* Chips de métodos de pago */
        <div className="flex flex-wrap gap-2">
          {METODOS_PAGO.map(m => {
            const usado = metodosUsados.has(m.id)
            const pagoExistente = pagos.find(p => p.metodo === m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => seleccionarChip(m.id)}
                disabled={usado}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition ${
                  usado
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-white hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <span>{m.emoji}</span>
                <span>{m.nombre}</span>
                {usado && pagoExistente && (
                  <span className="text-xs ml-1">✅ ${pagoExistente.monto.toLocaleString()}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Lista de pagos confirmados */}
      {pagos.length > 0 && (
        <div className="space-y-1.5">
          {pagos.map((pago, idx) => (
            <div key={idx} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{METODO_PAGO_ICONS[pago.metodo] || '💳'}</span>
                <span className="text-sm text-gray-600">
                  {METODOS_PAGO.find(m => m.id === pago.metodo)?.nombre}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">${pago.monto.toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => eliminarPago(idx)}
                  className="text-gray-400 hover:text-red-500 p-0.5 transition"
                  title="Eliminar pago"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen de pagos */}
      {total > 0 && (
        <div className="space-y-1 pt-2 border-t">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Total pagado:</span>
            <span className="font-bold text-green-600">${totalPagado.toLocaleString()}</span>
          </div>
          {saldoPendiente > 0 && (
            <div className="flex justify-between items-center text-sm text-red-600">
              <span>Saldo pendiente:</span>
              <span className="font-bold">${saldoPendiente.toLocaleString()}</span>
            </div>
          )}
          {saldoPendiente < 0 && (
            <div className="flex justify-between items-center text-sm text-blue-600">
              <span>Cambio:</span>
              <span className="font-bold">${Math.abs(saldoPendiente).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
