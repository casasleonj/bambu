import type { CuadrePedido } from './types'

interface ConfirmModalProps {
  cuadres: Record<string, CuadrePedido>
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
  resumen?: {
    totalCobrado: number
    totalFiado: number
    totalGastos: number
    noEntregados: number
    parciales: number
    faltante: number
    discrepancia: number
  }
}

export function ConfirmModal({ cuadres, submitting, onClose, onConfirm, resumen: _resumen }: ConfirmModalProps) {
  const noEntregados = Object.values(cuadres).filter((c) => c.entregado === 'NO_ENTREGADO').length
  const parciales = Object.values(cuadres).filter((c) => c.entregado === 'PARCIAL').length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold mb-2">Confirmar cierre de ruta</h3>
        <div className="text-sm text-gray-600 mb-4 space-y-1">
          {noEntregados > 0 && (
            <p className="text-red-600">
              ⚠️ {noEntregados} pedido(s) NO entregado(s) volverán a PENDIENTE
            </p>
          )}
          {parciales > 0 && (
            <p className="text-yellow-600">
              ⚠️ {parciales} pedido(s) con entrega PARCIAL
            </p>
          )}
          <p className="text-gray-500 mt-2">¿Estás seguro de continuar?</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Cerrando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
