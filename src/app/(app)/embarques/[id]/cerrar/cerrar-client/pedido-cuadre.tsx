import type { Pedido, PagoItem, CuadrePedido, EmbarqueAbierto } from './types'
import { METODOS_PAGO, calcularTotalEntregado, calcularMontoPagado } from './types'

interface PedidoCuadreProps {
  pedido: Pedido
  cuadre: CuadrePedido
  embarquesAbiertos: EmbarqueAbierto[]
  onUpdateCuadre: (pedidoId: string, updates: Partial<CuadrePedido>) => void
  onUpdateProductoEntregado: (pedidoId: string, field: keyof CuadrePedido['productosEntregados'], value: number) => void
  onUpdatePrecioReal: (pedidoId: string, field: keyof CuadrePedido['preciosReales'], value: number) => void
  onAgregarPago: (pedidoId: string) => void
  onEliminarPago: (pedidoId: string, index: number) => void
  onUpdatePago: (pedidoId: string, index: number, field: keyof PagoItem, value: string | number) => void
}

const PRODUCTOS = [
  { key: 'cPacaAguaEnt' as const, precioKey: 'pacaAgua' as const, emoji: '🍶', label: 'Paca Agua' },
  { key: 'cPacaHieloEnt' as const, precioKey: 'pacaHielo' as const, emoji: '🧊', label: 'Paca Hielo' },
  { key: 'cBotellonFabEnt' as const, precioKey: 'botellonFab' as const, emoji: '🏭', label: 'Bot. Fab' },
  { key: 'cBotellonDomEnt' as const, precioKey: 'botellonDom' as const, emoji: '🏠', label: 'Bot. Dom' },
  { key: 'cBolsaAguaEnt' as const, precioKey: 'bolsaAgua' as const, emoji: '💧', label: 'Bol. Agua' },
  { key: 'cBolsaHieloEnt' as const, precioKey: 'bolsaHielo' as const, emoji: '❄️', label: 'Bol. Hielo' },
]

const PEDIDO_KEYS: Record<string, keyof Pedido> = {
  cPacaAguaEnt: 'cPacaAguaPed',
  cPacaHieloEnt: 'cPacaHieloPed',
  cBotellonFabEnt: 'cBotellonFabPed',
  cBotellonDomEnt: 'cBotellonDomPed',
  cBolsaAguaEnt: 'cBolsaAguaPed',
  cBolsaHieloEnt: 'cBolsaHieloPed',
}

export function PedidoCuadre({
  pedido,
  cuadre,
  embarquesAbiertos,
  onUpdateCuadre,
  onUpdateProductoEntregado,
  onUpdatePrecioReal,
  onAgregarPago,
  onEliminarPago,
  onUpdatePago,
}: PedidoCuadreProps) {
  const totalReal = calcularTotalEntregado(cuadre)
  const montoPagado = calcularMontoPagado(cuadre.pagos)

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">#{pedido.numero}</span>
            <span>{pedido.cliente.nombre}</span>
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Pedido:{' '}
            {pedido.cPacaAguaPed > 0 && `${pedido.cPacaAguaPed} agua `}
            {pedido.cPacaHieloPed > 0 && `${pedido.cPacaHieloPed} hielo `}
            {pedido.cBotellonFabPed > 0 && `${pedido.cBotellonFabPed} bot.fab `}
            {pedido.cBotellonDomPed > 0 && `${pedido.cBotellonDomPed} bot.dom `}
            {pedido.cBolsaAguaPed > 0 && `${pedido.cBolsaAguaPed} bol.agua `}
            {pedido.cBolsaHieloPed > 0 && `${pedido.cBolsaHieloPed} bol.hielo `}
            = ${pedido.total.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Entrega */}
      <div className="mb-3">
        <label className="text-sm font-medium text-gray-700 mb-1 block">Entrega</label>
        <div className="flex gap-2">
          {(['COMPLETO', 'PARCIAL', 'NO_ENTREGADO'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onUpdateCuadre(pedido.id, { entregado: opt })
                if (opt === 'COMPLETO') {
                  onUpdateCuadre(pedido.id, {
                    productosEntregados: {
                      cPacaAguaEnt: pedido.cPacaAguaPed,
                      cPacaHieloEnt: pedido.cPacaHieloPed,
                      cBotellonFabEnt: pedido.cBotellonFabPed,
                      cBotellonDomEnt: pedido.cBotellonDomPed,
                      cBolsaAguaEnt: pedido.cBolsaAguaPed,
                      cBolsaHieloEnt: pedido.cBolsaHieloPed,
                    },
                  })
                }
                if (opt === 'NO_ENTREGADO') {
                  onUpdateCuadre(pedido.id, {
                    productosEntregados: {
                      cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
                      cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
                    },
                  })
                }
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                cuadre.entregado === opt
                  ? opt === 'COMPLETO' ? 'bg-green-600 text-white'
                    : opt === 'PARCIAL' ? 'bg-yellow-500 text-white'
                    : 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {opt === 'COMPLETO' ? '✅ Completo' : opt === 'PARCIAL' ? '⚠️ Parcial' : '❌ No entregado'}
            </button>
          ))}
        </div>
      </div>

      {/* Reasignar si no entregado */}
      {cuadre.entregado === 'NO_ENTREGADO' && embarquesAbiertos.length > 0 && (
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Reasignar a otro embarque</label>
          <select
            value={cuadre.nuevoEmbarqueId || ''}
            onChange={(e) => onUpdateCuadre(pedido.id, { nuevoEmbarqueId: e.target.value || undefined })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Sin reasignar (queda pendiente)</option>
            {embarquesAbiertos.map((e) => (
              <option key={e.id} value={e.id}>
                #{e.numero} - {e.trabajador.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Productos entregados + precios reales */}
      {cuadre.entregado !== 'NO_ENTREGADO' && (
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            Productos entregados y precios reales
          </label>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium">Producto</th>
                  <th className="px-2 py-2 text-center text-xs font-medium">Pedido</th>
                  <th className="px-2 py-2 text-center text-xs font-medium">Entregó</th>
                  <th className="px-2 py-2 text-center text-xs font-medium">Precio</th>
                  <th className="px-2 py-2 text-right text-xs font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {PRODUCTOS.map((prod) => {
                  const cant = cuadre.productosEntregados[prod.key]
                  const precio = cuadre.preciosReales[prod.precioKey]
                  const pedidoKey = PEDIDO_KEYS[prod.key]
                  const pedidoCant = pedido[pedidoKey] as number
                  const subtotal = cant * precio
                  return (
                    <tr key={prod.key} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5">
                        <span className="text-xs">{prod.emoji}</span>
                        <span className="ml-1 text-xs font-medium">{prod.label}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs text-gray-400">{pedidoCant}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" min={0}
                          value={cant}
                          onChange={(e) => onUpdateProductoEntregado(pedido.id, prod.key, parseInt(e.target.value) || 0)}
                          className="w-14 text-center px-1 py-0.5 border rounded text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-0.5">
                          <span className="text-xs text-gray-400">$</span>
                          <input
                            type="number" min={0}
                            value={precio || ''}
                            onChange={(e) => onUpdatePrecioReal(pedido.id, prod.precioKey, parseFloat(e.target.value) || 0)}
                            className="w-16 text-right px-1 py-0.5 border rounded text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium">
                        {subtotal > 0 ? `$${subtotal.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pago */}
      {cuadre.entregado !== 'NO_ENTREGADO' && (
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Pago</label>
          <div className="space-y-2">
            {cuadre.pagos.map((pago, idx) => (
              <div key={idx} className="flex gap-2">
                <select
                  value={pago.metodo}
                  onChange={(e) => onUpdatePago(pedido.id, idx, 'metodo', e.target.value)}
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
                  onChange={(e) => onUpdatePago(pedido.id, idx, 'monto', parseFloat(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Monto"
                />
                <button
                  onClick={() => onEliminarPago(pedido.id, idx)}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => onAgregarPago(pedido.id)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Agregar pago
            </button>
          </div>
          <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
            Total entregado: ${totalReal.toLocaleString()} |
            Cobrado: ${montoPagado.toLocaleString()} |
            Saldo: ${(totalReal - montoPagado).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}
