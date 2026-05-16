import type { VentaLibre, PagoItem, Cliente } from './types'
import { METODOS_PAGO, calcularMontoPagado } from './types'
import { formatCurrency } from '@/lib/utils'

const PRODUCTOS_VENTA = [
  { key: 'cPacaAgua', label: 'Paca Agua' },
  { key: 'cPacaHielo', label: 'Paca Hielo' },
  { key: 'cBotellonFab', label: 'Bot. Fab' },
  { key: 'cBotellonDom', label: 'Bot. Dom' },
  { key: 'cBolsaAgua', label: 'Bolsa Agua' },
  { key: 'cBolsaHielo', label: 'Bolsa Hielo' },
] as const

interface VentaLibreRowProps {
  venta: VentaLibre
  index: number
  clientes: Cliente[]
  onUpdate: (index: number, field: keyof VentaLibre, value: unknown) => void
  onAgregarPago: (ventaIndex: number) => void
  onEliminarPago: (ventaIndex: number, pagoIndex: number) => void
  onUpdatePago: (ventaIndex: number, pagoIndex: number, field: keyof PagoItem, value: string | number) => void
  onRemove: (index: number) => void
}

export function VentaLibreRow({
  venta,
  index,
  clientes,
  onUpdate,
  onAgregarPago,
  onEliminarPago,
  onUpdatePago,
  onRemove,
}: VentaLibreRowProps) {
  const totalPagado = calcularMontoPagado(venta.pagos)

  return (
    <div className="border rounded-lg p-3 mb-2 space-y-2">
      <div className="flex gap-2">
        <select
          value={venta.clienteId}
          onChange={(e) => {
            const cliente = clientes.find((c) => c.id === e.target.value)
            onUpdate(index, 'clienteId', e.target.value)
            onUpdate(index, 'clienteNombre', cliente?.nombre || '')
          }}
          className="flex-1 px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Seleccionar cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <button
          onClick={() => onRemove(index)}
          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
        >
          Eliminar
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PRODUCTOS_VENTA.map(({ key, label }) => (
          <div key={key}>
            <label className="text-xs text-gray-500">{label}</label>
            <input
              type="number"
              min={0}
              value={(venta as unknown as Record<string, number>)[key]}
              onChange={(e) => onUpdate(index, key as keyof VentaLibre, parseInt(e.target.value) || 0)}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Pagos</label>
        {venta.pagos.map((pago, pIdx) => (
          <div key={pIdx} className="flex gap-2">
            <select
              value={pago.metodo}
              onChange={(e) => onUpdatePago(index, pIdx, 'metodo', e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={pago.monto}
              onChange={(e) => onUpdatePago(index, pIdx, 'monto', parseFloat(e.target.value) || 0)}
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
              placeholder="Monto"
            />
            <button
              onClick={() => onEliminarPago(index, pIdx)}
              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => onAgregarPago(index)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          + Agregar pago
        </button>
      </div>
      <div className="text-sm text-gray-600">
        Total pagado: {formatCurrency(totalPagado)}
      </div>
    </div>
  )
}
