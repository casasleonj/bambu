'use client'

import { formatCurrency } from '@/lib/utils'
import { useSaldoFavorPedido, type ProyeccionReversion } from './use-saldo-favor-pedido'

interface Props {
  pedidoId: string
  /** 'anular' (pedido entregado) o 'cancelar' (aún no entregado): solo cambia el verbo. */
  accion: 'anular' | 'cancelar'
}

/**
 * Bloque del diálogo de anular/cancelar (#577): antes de confirmar, dice qué pasará con el saldo a
 * favor que este pedido pasó al cliente. Nunca bloquea: el servidor aplica la regla aunque este
 * bloque no haya cargado.
 */
export function SaldoFavorAnulacionAviso({ pedidoId, accion }: Props) {
  const e = useSaldoFavorPedido(pedidoId)

  if (e.estado === 'cargando') {
    return <p className="text-xs text-gray-500" data-testid="saldo-favor-cargando">Revisando el saldo a favor de este pedido…</p>
  }

  if (e.estado === 'sin-conexion') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="saldo-favor-sin-conexion">
        <p className="font-semibold">No pude calcular el saldo a favor</p>
        <p className="mt-1">
          Si este pedido pasó dinero al saldo a favor del cliente, se restará cuando {accion === 'anular' ? 'la anulación' : 'la cancelación'} se envíe.
          Al terminar verás el monto exacto.
        </p>
      </div>
    )
  }

  const { proyeccion, cliente } = e.datos
  if (!proyeccion || proyeccion.salioDelPedido <= 0) {
    return (
      <p className="text-xs text-gray-600" data-testid="saldo-favor-sin-credito">
        Este pedido no pasó dinero al saldo a favor. El saldo a favor del cliente no cambia.
      </p>
    )
  }

  return <Detalle p={proyeccion} tienda={cliente.tienda ?? cliente.titular} accion={accion} />
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <>
      <span className={fuerte ? 'font-semibold' : ''}>{etiqueta}</span>
      <span className={`text-right tabular-nums ${fuerte ? 'font-bold' : ''}`}>{valor}</span>
    </>
  )
}

function Detalle({ p, tienda, accion }: { p: ProyeccionReversion; tienda: string; accion: 'anular' | 'cancelar' }) {
  const parteUsada = p.yaUsado > 0
  const otrosPedidos = p.saldoActual - p.seResta
  return (
    <div
      className={`rounded-lg border p-3 text-xs ${parteUsada ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-100 bg-blue-50 text-blue-900'}`}
      data-testid={parteUsada ? 'saldo-favor-parte-usada' : 'saldo-favor-se-resta'}
    >
      <p className="font-semibold">Saldo a favor de este pedido{parteUsada ? ' · parte ya usada' : ''}</p>
      <p className="mt-1">
        {parteUsada
          ? <>Este pedido pasó <b>{formatCurrency(p.salioDelPedido)}</b> al saldo a favor de {tienda}. El cliente ya usó <b>{formatCurrency(p.yaUsado)}</b> para pagar otros pedidos: ese uso queda como está y el cliente no queda debiendo por eso.</>
          : <>Este pedido pasó <b>{formatCurrency(p.salioDelPedido)}</b> al saldo a favor de {tienda}. Al {accion}, ese saldo se resta: el dinero pagado de más no queda como crédito de un pedido que ya no existe.</>}
      </p>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-black/10 pt-2">
        <Fila etiqueta="Salió de este pedido" valor={formatCurrency(p.salioDelPedido)} />
        {parteUsada && <Fila etiqueta="Ya usado en otros pedidos" valor={formatCurrency(p.yaUsado)} />}
        <Fila etiqueta="Se resta ahora" valor={formatCurrency(p.seResta)} fuerte />
        <Fila etiqueta="Saldo a favor del cliente" valor={`${formatCurrency(p.saldoActual)} → ${formatCurrency(p.saldoDespues)}`} fuerte />
      </div>
      {otrosPedidos > 0 && (
        <p className="mt-2 text-gray-600">Los {formatCurrency(otrosPedidos)} restantes vienen de otros pedidos y no cambian.</p>
      )}
      <p className="mt-1 text-gray-600">Devolver dinero en efectivo al cliente se hace aparte.</p>
    </div>
  )
}
