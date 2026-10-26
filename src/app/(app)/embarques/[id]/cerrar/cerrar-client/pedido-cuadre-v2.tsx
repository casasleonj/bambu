import type { Pedido, PagoItem, CuadrePedido, EmbarqueAbierto, DecisionPendiente } from './types'
import { METODOS_PAGO } from './types'
import { derivarEntrega, entregaCompleta, lineasEntrega, resumenDineroPedido, type LineaEntrega } from './cierre-logic'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { formatCurrency } from '@/lib/utils'
import { PedidoClienteDisplay } from '@/components/pedido-cliente-display'

interface PedidoCuadreV2Props {
  pedido: Pedido
  cuadre: CuadrePedido
  embarquesAbiertos: EmbarqueAbierto[]
  onUpdateCuadre: (pedidoId: string, updates: Partial<CuadrePedido>) => void
  onUpdateProductoEntregado: (pedidoId: string, field: keyof CuadrePedido['productosEntregados'], value: number) => void
  onAgregarPago: (pedidoId: string) => void
  onEliminarPago: (pedidoId: string, index: number) => void
  onUpdatePago: (pedidoId: string, index: number, field: keyof PagoItem, value: string | number) => void
}

const ESTADO_UI = {
  COMPLETO: { texto: 'Completo', clase: 'bg-green-100 text-green-800' },
  PARCIAL: { texto: 'Parcial', clase: 'bg-amber-100 text-amber-800' },
  NO_ENTREGADO: { texto: 'No entregado', clase: 'bg-red-100 text-red-800' },
} as const

const CODIGO_ICONO: Record<string, string> = {
  PACA_AGUA: 'PACA_AGUA',
  PACA_HIELO: 'PACA_HIELO',
  BOTELLON: 'BOTELLON',
  BOLSA_AGUA: 'BOLSA_AGUA',
  BOLSA_HIELO: 'BOLSA_HIELO',
}

function LineaFila({
  linea,
  onCambiar,
}: {
  linea: LineaEntrega
  onCambiar: (valor: number) => void
}) {
  const Icon = getProductoIconConfig(CODIGO_ICONO[linea.codigo]).Icon
  const set = (v: number) => onCambiar(Math.min(linea.pendiente, Math.max(0, Number.isFinite(v) ? Math.trunc(v) : 0)))
  return (
    <div className="rounded-lg bg-gray-50 p-3" data-testid={`linea-${linea.codigo}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon size={16} />
        {linea.label}
      </div>
      <div className="mt-1 text-xs text-gray-500">
        Pidió {linea.pidio}
        {linea.yaEntregado > 0 && <> · ya entregado {linea.yaEntregado}</>} · pendiente {linea.pendiente}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={`Menos ${linea.label}`}
          onClick={() => set(linea.ahora - 1)}
          disabled={linea.ahora <= 0}
          className="h-11 w-11 rounded-lg border bg-white text-xl disabled:opacity-40"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={linea.pendiente}
          aria-label={`Entrega ahora ${linea.label}`}
          value={linea.ahora}
          onChange={(e) => set(parseInt(e.target.value, 10))}
          className="h-11 w-16 rounded-lg border-2 border-blue-400 bg-white text-center text-lg font-bold"
        />
        <button
          type="button"
          aria-label={`Más ${linea.label}`}
          onClick={() => set(linea.ahora + 1)}
          disabled={linea.ahora >= linea.pendiente}
          className="h-11 w-11 rounded-lg border bg-white text-xl disabled:opacity-40"
        >
          +
        </button>
        <button type="button" onClick={() => set(linea.pendiente)} className="h-11 rounded-lg border bg-white px-3 text-sm">
          Todo ({linea.pendiente})
        </button>
        <button type="button" onClick={() => set(0)} className="h-11 rounded-lg border bg-white px-3 text-sm">
          No entregué (0)
        </button>
        <span className={`ml-auto text-sm font-semibold ${linea.falta > 0 ? 'text-amber-700' : 'text-green-700'}`} data-testid="linea-falta">
          Falta {linea.falta}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-400">Este campo no pasa del pendiente. Si el cliente pidió más, regístralo como venta libre.</p>
    </div>
  )
}

export function PedidoCuadreV2({
  pedido,
  cuadre,
  embarquesAbiertos,
  onUpdateCuadre,
  onUpdateProductoEntregado,
  onAgregarPago,
  onEliminarPago,
  onUpdatePago,
}: PedidoCuadreV2Props) {
  const lineas = lineasEntrega(pedido, cuadre.productosEntregados)
  const r = derivarEntrega(lineas)
  const dinero = resumenDineroPedido(pedido, cuadre.pagos)
  const nombre = `${pedido.nombreCli}${pedido.apellidoCli ? ` ${pedido.apellidoCli}` : ''}`
  const ui = ESTADO_UI[r.estado]

  function cambiarLinea(l: LineaEntrega, valor: number) {
    onUpdateProductoEntregado(pedido.id, l.key, valor)
    const proximo = lineas.map((x) => (x.key === l.key ? { ...x, ahora: valor, falta: Math.max(0, x.pendiente - valor) } : x))
    const estado = derivarEntrega(proximo)
    onUpdateCuadre(pedido.id, {
      entregado: estado.estado,
      // La decisión sólo tiene sentido mientras quede pendiente.
      ...(estado.requiereDecision ? {} : { decisionPendiente: undefined }),
    })
  }

  function atajo(todo: boolean) {
    const ent = todo
      ? entregaCompleta(pedido)
      : { cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 }
    onUpdateCuadre(pedido.id, { productosEntregados: ent, entregado: todo ? 'COMPLETO' : 'NO_ENTREGADO', decisionPendiente: undefined })
  }

  function cobrarSaldo() {
    const restante = dinero.saldoPrevio - dinero.cobrarAhora
    if (restante <= 0) return
    if (cuadre.pagos.length === 0) {
      onAgregarPago(pedido.id)
      onUpdatePago(pedido.id, 0, 'monto', restante)
    } else {
      const ultimo = cuadre.pagos.length - 1
      onUpdatePago(pedido.id, ultimo, 'monto', (cuadre.pagos[ultimo].monto || 0) + restante)
    }
  }

  const decisiones: Array<{ valor: DecisionPendiente; titulo: string; detalle: string }> = [
    { valor: 'OTRA_VISITA', titulo: 'Otra visita', detalle: 'Queda pendiente en este mismo pedido y se reprograma.' },
    {
      valor: 'NO_QUIERE_RESTO',
      titulo: 'El cliente ya no quiere el resto',
      detalle: 'Pendiente de autorización en oficina: queda anotado, el total NO cambia y el pedido sigue con lo que falta.',
    },
  ]

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm" data-testid={`cuadre-v2-${pedido.numero}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">#{pedido.numero}</span>
            <PedidoClienteDisplay
              clienteId={pedido.clienteId}
              nombreCli={nombre}
              apellidoCli={null}
              negocioId={pedido.negocioId}
              nombreNegocioCli={pedido.nombreNegocioCli}
              variant="row"
            />
          </div>
          <div className="mt-1 text-sm text-gray-500">Valor del pedido {formatCurrency(dinero.valorPedido)}</div>
          <a
            href={`/pedidos?openPedido=${pedido.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-blue-700 underline"
            data-testid="cuadre-corregir-precio"
          >
            ¿Precio equivocado? Corregirlo en el pedido
          </a>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${ui.clase}`} data-testid="estado-derivado">
          {ui.texto}
          {r.estado === 'PARCIAL' && ` · faltan ${r.totalFalta}`}
        </span>
      </div>

      <div className="mb-3 space-y-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => atajo(true)} className="h-11 flex-1 rounded-lg border bg-white text-sm font-medium">
            Entregué todo
          </button>
          <button type="button" onClick={() => atajo(false)} className="h-11 flex-1 rounded-lg border bg-white text-sm font-medium">
            No entregué nada
          </button>
        </div>
        {lineas.map((l) => (
          <LineaFila key={l.key} linea={l} onCambiar={(v) => cambiarLinea(l, v)} />
        ))}
      </div>

      {r.requiereDecision && (
        <fieldset className="mb-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3" data-testid="decision-pendiente">
          <legend className="px-1 text-sm font-bold text-amber-900">¿Qué pasa con las {r.totalFalta} que faltan?</legend>
          <div className="space-y-2">
            {decisiones.map((d) => (
              <label key={d.valor} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-white p-3">
                <input
                  type="radio"
                  name={`decision-${pedido.id}`}
                  className="mt-1"
                  checked={cuadre.decisionPendiente === d.valor}
                  onChange={() => onUpdateCuadre(pedido.id, { decisionPendiente: d.valor })}
                />
                <span className="text-sm">
                  <b>{d.titulo}</b>
                  <br />
                  <span className="text-xs text-gray-600">{d.detalle}</span>
                </span>
              </label>
            ))}
          </div>
          {!cuadre.decisionPendiente && <p className="mt-2 text-xs text-red-700">Elige una opción para continuar.</p>}
        </fieldset>
      )}

      {r.estado === 'NO_ENTREGADO' && embarquesAbiertos.length > 0 && (
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700">Reasignar a otro embarque</label>
          <select
            value={cuadre.nuevoEmbarqueId || ''}
            onChange={(e) => onUpdateCuadre(pedido.id, { nuevoEmbarqueId: e.target.value || undefined })}
            className="h-11 w-full rounded-lg border px-3 text-sm"
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

      {r.estado !== 'NO_ENTREGADO' && (
        <div className="rounded-lg bg-gray-50 p-3" data-testid="panel-dinero">
          <div className="text-sm font-semibold text-gray-700">Dinero de este pedido</div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Valor del pedido</dt><dd>{formatCurrency(dinero.valorPedido)}</dd></div>
            <div className="flex justify-between"><dt>Ya pagado antes</dt><dd>{formatCurrency(dinero.yaPagado)}</dd></div>
            <div className="flex justify-between"><dt>Cobrar ahora</dt><dd className="font-semibold">{formatCurrency(dinero.cobrarAhora)}</dd></div>
          </dl>

          <div className="mt-2 space-y-2">
            {cuadre.pagos.map((pago, idx) => (
              <div key={idx} className="flex gap-2">
                <select
                  aria-label="Método de pago"
                  value={pago.metodo}
                  onChange={(e) => onUpdatePago(pedido.id, idx, 'metodo', e.target.value)}
                  className="h-11 rounded-lg border px-2 text-sm"
                >
                  {METODOS_PAGO.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label="Monto cobrado"
                  value={pago.monto}
                  onChange={(e) => onUpdatePago(pedido.id, idx, 'monto', parseFloat(e.target.value) || 0)}
                  className="h-11 flex-1 rounded-lg border px-3 text-sm"
                  placeholder="Monto"
                />
                <button type="button" aria-label="Quitar pago" onClick={() => onEliminarPago(pedido.id, idx)} className="h-11 w-11 rounded-lg text-red-600 hover:bg-red-50">
                  ✕
                </button>
              </div>
            ))}
            <div className="flex gap-3">
              <button type="button" onClick={() => onAgregarPago(pedido.id)} className="min-h-11 text-sm font-medium text-blue-600">
                + Agregar pago
              </button>
              {dinero.saldoPrevio - dinero.cobrarAhora > 0.01 && (
                <button type="button" onClick={cobrarSaldo} className="min-h-11 text-sm font-medium text-blue-600" data-testid="cobrar-saldo">
                  Cobrar el saldo ({formatCurrency(dinero.saldoPrevio - dinero.cobrarAhora)})
                </button>
              )}
            </div>
          </div>

          {dinero.excede && (
            <p className="mt-2 text-sm font-medium text-red-700" data-testid="cobro-excede">
              El cobro ({formatCurrency(dinero.cobrarAhora)}) es mayor que lo que el cliente debe ({formatCurrency(dinero.saldoPrevio)}).
            </p>
          )}

          <div className={`mt-2 rounded-lg p-2 text-sm font-semibold ${dinero.esFiado ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'}`} data-testid="queda-por-cobrar">
            {dinero.esFiado
              ? `Queda por cobrar ${formatCurrency(dinero.queda)} → fiado de ${nombre}`
              : 'Pagado completo'}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Efectivo que debe entregar el repartidor por este pedido: {formatCurrency(dinero.efectivo)}
            {dinero.digitalPorVerificar > 0 && <> · cobro digital por verificar: {formatCurrency(dinero.digitalPorVerificar)}</>}
          </p>
        </div>
      )}
    </div>
  )
}
