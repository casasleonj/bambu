import type { Pedido, PagoItem, CuadrePedido, EmbarqueAbierto } from './types'
import { METODOS_PAGO, calcularMontoPagado } from './types'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { formatCurrency } from '@/lib/utils'
import { useProductosDomicilio } from '@/hooks/use-productos-domicilio'
import { PedidoClienteDisplay } from '@/components/pedido-cliente-display'

interface PedidoCuadreProps {
  pedido: Pedido
  cuadre: CuadrePedido
  embarquesAbiertos: EmbarqueAbierto[]
  isAdmin: boolean
  onUpdateCuadre: (pedidoId: string, updates: Partial<CuadrePedido>) => void
  onUpdateProductoEntregado: (pedidoId: string, field: keyof CuadrePedido['productosEntregados'], value: number) => void
  onUpdatePrecioReal: (pedidoId: string, field: keyof CuadrePedido['preciosReales'], value: number) => void
  onAgregarPago: (pedidoId: string) => void
  onEliminarPago: (pedidoId: string, index: number) => void
  onUpdatePago: (pedidoId: string, index: number, field: keyof PagoItem, value: string | number) => void
}

const CODIGO_MAP: Record<string, string> = {
  cPacaAguaEnt: 'PACA_AGUA',
  cPacaHieloEnt: 'PACA_HIELO',
  cBotellonFabEnt: 'BOTELLON',
  cBotellonDomEnt: 'BOTELLON',
  cBolsaAguaEnt: 'BOLSA_AGUA',
  cBolsaHieloEnt: 'BOLSA_HIELO',
}

const PEDIDO_KEYS: Record<string, keyof Pedido> = {
  cPacaAguaEnt: 'cPacaAguaPed',
  cPacaHieloEnt: 'cPacaHieloPed',
  cBotellonFabEnt: 'cBotellonFabPed',
  cBotellonDomEnt: 'cBotellonDomPed',
  cBolsaAguaEnt: 'cBolsaAguaPed',
  cBolsaHieloEnt: 'cBolsaHieloPed',
}

// PR-1: unidades ya entregadas de un pedido re-planificado (cierre parcial previo).
const ENT_KEYS: Record<string, keyof Pedido> = {
  cPacaAguaEnt: 'cPacaAguaEnt',
  cPacaHieloEnt: 'cPacaHieloEnt',
  cBotellonFabEnt: 'cBotellonFabEnt',
  cBotellonDomEnt: 'cBotellonDomEnt',
  cBolsaAguaEnt: 'cBolsaAguaEnt',
  cBolsaHieloEnt: 'cBolsaHieloEnt',
}

interface ProductoCampo {
  key: keyof CuadrePedido['productosEntregados']
  precioKey: keyof CuadrePedido['preciosReales']
  label: string
  codigo: string
}

const ALL_PRODUCTOS: ProductoCampo[] = [
  { key: 'cPacaAguaEnt', precioKey: 'pacaAgua', label: 'Paca Agua', codigo: 'PACA_AGUA' },
  { key: 'cPacaHieloEnt', precioKey: 'pacaHielo', label: 'Paca Hielo', codigo: 'PACA_HIELO' },
  { key: 'cBotellonFabEnt', precioKey: 'botellonFab', label: 'Bot. Fab', codigo: 'BOTELLON' },
  { key: 'cBotellonDomEnt', precioKey: 'botellonDom', label: 'Bot. Dom', codigo: 'BOTELLON' },
  { key: 'cBolsaAguaEnt', precioKey: 'bolsaAgua', label: 'Bol. Agua', codigo: 'BOLSA_AGUA' },
  { key: 'cBolsaHieloEnt', precioKey: 'bolsaHielo', label: 'Bol. Hielo', codigo: 'BOLSA_HIELO' },
]

export function PedidoCuadre({
  pedido,
  cuadre,
  embarquesAbiertos,
  isAdmin,
  onUpdateCuadre,
  onUpdateProductoEntregado,
  onUpdatePrecioReal,
  onAgregarPago,
  onEliminarPago,
  onUpdatePago,
}: PedidoCuadreProps) {
  const { productos: productosDomicilio } = useProductosDomicilio()
  const domicilioCodes = new Set(productosDomicilio.map(p => p.codigo))

  const PRODUCTOS = ALL_PRODUCTOS.filter(p => domicilioCodes.has(p.codigo))

  const montoPagado = calcularMontoPagado(cuadre.pagos)

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">#{pedido.numero}</span>
            <PedidoClienteDisplay
              clienteId={pedido.clienteId}
              nombreCli={pedido.nombreCli}
              apellidoCli={pedido.apellidoCli}
              negocioId={pedido.negocioId}
              nombreNegocioCli={pedido.nombreNegocioCli}
              variant="row"
            />
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Pedido:{' '}
            {pedido.cPacaAguaPed > 0 && `${pedido.cPacaAguaPed} agua `}
            {pedido.cPacaHieloPed > 0 && `${pedido.cPacaHieloPed} hielo `}
            {pedido.cBotellonFabPed > 0 && `${pedido.cBotellonFabPed} bot.fab `}
            {pedido.cBotellonDomPed > 0 && `${pedido.cBotellonDomPed} bot.dom `}
            {pedido.cBolsaAguaPed > 0 && `${pedido.cBolsaAguaPed} bol.agua `}
            {pedido.cBolsaHieloPed > 0 && `${pedido.cBolsaHieloPed} bol.hielo `}
            = {formatCurrency(pedido.total)}
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
                  // PR-1: "Entregó" es el delta de este cierre → el resto pendiente.
                  onUpdateCuadre(pedido.id, {
                    productosEntregados: {
                      cPacaAguaEnt: Math.max(0, pedido.cPacaAguaPed - (pedido.cPacaAguaEnt || 0)),
                      cPacaHieloEnt: Math.max(0, pedido.cPacaHieloPed - (pedido.cPacaHieloEnt || 0)),
                      cBotellonFabEnt: Math.max(0, pedido.cBotellonFabPed - (pedido.cBotellonFabEnt || 0)),
                      cBotellonDomEnt: Math.max(0, pedido.cBotellonDomPed - (pedido.cBotellonDomEnt || 0)),
                      cBolsaAguaEnt: Math.max(0, pedido.cBolsaAguaPed - (pedido.cBolsaAguaEnt || 0)),
                      cBolsaHieloEnt: Math.max(0, pedido.cBolsaHieloPed - (pedido.cBolsaHieloEnt || 0)),
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
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              Productos entregados y precios
            </label>
            {!isAdmin && (
              <span className="text-xs text-gray-400">
                🔒 Precios congelados — solo ADMIN puede editar
              </span>
            )}
          </div>
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
                  const yaEntregado = (pedido[ENT_KEYS[prod.key]] as number) || 0
                  const subtotal = cant * precio

                  // Precio original del pedido (congelado)
                  const precioOriginalKey = (`precio${prod.precioKey.charAt(0).toUpperCase() + prod.precioKey.slice(1)}`) as keyof Pedido
                  const precioOriginal = Number(pedido[precioOriginalKey] || 0)
                  const diff = precio - precioOriginal
                  const diffPct = precioOriginal > 0 ? ((diff / precioOriginal) * 100).toFixed(0) : '0'

                  const iconCfg = getProductoIconConfig(CODIGO_MAP[prod.key])
                  const Icon = iconCfg.Icon
                  return (
                    <tr key={prod.key} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5">
                        <Icon size={16} className="inline-block align-text-bottom" />
                        <span className="ml-1 text-xs font-medium">{prod.label}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs text-gray-400">
                        {pedidoCant}
                        {yaEntregado > 0 && (
                          <span className="block text-[10px] text-amber-600" title="Ya entregado en un cierre anterior">
                            ya {yaEntregado}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" min={0} max={Math.max(0, pedidoCant - yaEntregado)}
                          value={cant}
                          onChange={(e) => onUpdateProductoEntregado(pedido.id, prod.key, parseInt(e.target.value) || 0)}
                          className="w-14 text-center px-1 py-0.5 border rounded text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-0.5">
                            <span className="text-xs text-gray-400">$</span>
                            <input
                              type="number" min={0}
                              value={precio || ''}
                              onChange={(e) => onUpdatePrecioReal(pedido.id, prod.precioKey, parseFloat(e.target.value) || 0)}
                              disabled={!isAdmin}
                              className={`w-16 text-right px-1 py-0.5 border rounded text-sm ${
                                !isAdmin ? 'bg-gray-100 cursor-not-allowed' : ''
                              } ${diff !== 0 ? 'border-amber-400 bg-amber-50' : ''}`}
                            />
                          </div>
                          {diff !== 0 && (
                            <span className={`text-xs ${diff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {diff > 0 ? '↑' : '↓'} {diffPct}% (orig. {formatCurrency(precioOriginal)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium">
                        {subtotal > 0 ? formatCurrency(subtotal) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* #326: corregir un precio recalcula la obligación del pedido (total, saldo y factura). */}
          {isAdmin && (() => {
            const cambios = PRODUCTOS.flatMap((prod) => {
              const precio = Number(cuadre.preciosReales[prod.precioKey]) || 0
              const key = (`precio${prod.precioKey.charAt(0).toUpperCase() + prod.precioKey.slice(1)}`) as keyof Pedido
              const original = Number(pedido[key] || 0)
              const pedida = Number(pedido[PEDIDO_KEYS[prod.key]] || 0)
              // Un precio vacío o 0 no corrige nada (el servidor lo ignora).
              return precio > 0 && original > 0 && pedida > 0 && Math.abs(precio - original) > 0.001
                ? [(precio - original) * pedida]
                : []
            })
            if (cambios.length === 0) return null
            const totalActual = Number(pedido.total)
            const pagadoPrevio = Number(pedido.totalPagado)
            const totalNuevo = totalActual + cambios.reduce((a, b) => a + b, 0)
            const saldoNuevo = totalNuevo - pagadoPrevio - montoPagado
            const sobrepago = totalNuevo < pagadoPrevio - 0.005
            const sinMotivo = (cuadre.motivoPrecio ?? '').trim().length < 5
            return (
              <div
                className={`mt-2 p-3 border rounded text-xs space-y-2 ${sobrepago ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
                data-testid="correccion-precio-aviso"
              >
                <p>
                  ⚠️ Corregir el precio cambia lo que el cliente debe: el total del pedido pasa de{' '}
                  <strong>{formatCurrency(totalActual)}</strong> a <strong>{formatCurrency(totalNuevo)}</strong>
                  {!sobrepago && <> y el saldo quedará en <strong>{formatCurrency(Math.max(0, saldoNuevo))}</strong></>}.
                </p>
                {sobrepago ? (
                  <p>
                    El cliente ya pagó {formatCurrency(pagadoPrevio)}, más que el nuevo total. No se puede cerrar así:
                    la diferencia requiere primero una reversión monetaria.
                  </p>
                ) : (
                  <div>
                    <label className="block font-medium mb-1" htmlFor={`motivo-precio-${pedido.id}`}>
                      Motivo de la corrección (obligatorio)
                    </label>
                    <textarea
                      id={`motivo-precio-${pedido.id}`}
                      data-testid={`motivo-precio-${pedido.id}`}
                      value={cuadre.motivoPrecio ?? ''}
                      onChange={(e) => onUpdateCuadre(pedido.id, { motivoPrecio: e.target.value })}
                      rows={2}
                      maxLength={500}
                      className={`w-full px-2 py-1 border rounded text-sm text-gray-800 ${sinMotivo ? 'border-red-300' : ''}`}
                    />
                  </div>
                )}
              </div>
            )
          })()}
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
            Obligación: {formatCurrency(Number(pedido.total))} |
            Ya pagado: {formatCurrency(Number(pedido.totalPagado))} |
            Cobrado ahora: {formatCurrency(montoPagado)} |
            Saldo pendiente: {formatCurrency(Number(pedido.total) - Number(pedido.totalPagado) - montoPagado)}
          </div>
        </div>
      )}
    </div>
  )
}
