import type { CuadrePedido } from './types'
import { formatCurrency } from '@/lib/utils'
import { DEUDA_FALTANTE_CAJA_PLAZO_NOMINAS_DEFAULT, DEUDA_FALTANTE_CAJA_PORCENTAJE_NOMINA_DEFAULT } from '@/lib/constants'

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
    faltanteEfectivo?: number
    generaraDeuda?: boolean
    nombreTrabajador?: string
  }
}

export function ConfirmModal({ cuadres, submitting, onClose, onConfirm, resumen }: ConfirmModalProps) {
  const noEntregados = Object.values(cuadres).filter((c) => c.entregado === 'NO_ENTREGADO').length
  const parciales = Object.values(cuadres).filter((c) => c.entregado === 'PARCIAL').length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="confirm-modal">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-3">Confirmar cierre de ruta</h3>

        {/* Financial summary — FIX #19 */}
        {resumen && (
          <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total cobrado</span>
              <span className="font-semibold text-green-700">{formatCurrency(resumen.totalCobrado)}</span>
            </div>
            {resumen.totalFiado > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Fiado pendiente</span>
                <span className="font-semibold text-amber-700">{formatCurrency(resumen.totalFiado)}</span>
              </div>
            )}
            {resumen.totalGastos > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Gastos</span>
                <span className="font-semibold text-red-700">- {formatCurrency(resumen.totalGastos)}</span>
              </div>
            )}
            {resumen.faltante !== 0 && (
              <div className={`flex justify-between border-t pt-1 ${resumen.faltante < 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>{resumen.faltante < 0 ? 'Faltante' : 'Sobrante'}</span>
                <span className="font-bold">{formatCurrency(resumen.faltante)}</span>
              </div>
            )}
            {resumen.discrepancia > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discrepancia</span>
                <span className="font-bold">{resumen.discrepancia} u.</span>
              </div>
            )}
            {resumen.generaraDeuda && resumen.faltanteEfectivo && resumen.faltanteEfectivo > 0 && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                <p className="text-sm font-semibold text-amber-900">
                  Se creará una deuda de {formatCurrency(resumen.faltanteEfectivo)} a {resumen.nombreTrabajador || 'el trabajador'}
                </p>
                <p className="text-xs text-amber-700">
                  Plan: {DEUDA_FALTANTE_CAJA_PLAZO_NOMINAS_DEFAULT} nóminas, máximo {DEUDA_FALTANTE_CAJA_PORCENTAJE_NOMINA_DEFAULT}% por nómina.
                </p>
              </div>
            )}
          </div>
        )}

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
          {noEntregados === 0 && parciales === 0 && (
            <p className="text-green-600">✅ Todos los pedidos entregados completos</p>
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
