'use client'

// #696 — Un movimiento del saldo a favor de un cliente, en tres niveles para entenderlo de un vistazo sin ruido:
//  1) línea corta siempre visible: qué pasó, cuándo y quién lo registró, con el monto;
//  2) recuadro al pasar el cursor, enfocar o tocar «Pedido #N» (pedido, factura, negocio);
//  3) «Ver detalle» (desplegable): todo lo que se sabe. Lo que no se puede comprobar se omite o dice «sin dato».
import type { ReactNode } from 'react'
import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { formatCurrency } from '@/lib/utils'
import type { MovimientoSaldoFavorCliente, PedidoDeMovimiento } from '@/lib/saldo-favor-cliente'

const ROLES_ETIQUETA: Record<string, string> = {
  ADMIN: 'Administrador',
  ASISTENTE: 'Asistente',
  CONTADOR: 'Contador',
  REPARTIDOR: 'Repartidor',
  SELLADOR: 'Sellador',
}

const METODOS_ETIQUETA: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  TRANSFERENCIA: 'Transferencia',
}

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso))

/** Qué pasó, en palabras sencillas y desde el punto de vista del cliente. */
export function tituloMovimientoSaldoFavor(m: Pick<MovimientoSaldoFavorCliente, 'tipo' | 'origenTipo'>): string {
  switch (m.tipo) {
    case 'ENTRADA_COBRO':
      return 'Entregó de más al pagar fiados'
    case 'ACREDITACION':
      return m.origenTipo === 'REDUCCION_COMERCIAL' ? 'Reducción comercial de un pedido' : 'Corrección de precio de un pedido'
    case 'REAPLICACION':
      return 'Volvió a un pedido porque su total subió'
    case 'REVERSION_ANULACION':
      return m.origenTipo === 'CANCELACION' ? 'Se restó al cancelar un pedido' : 'Se restó al anular un pedido'
  }
}

/** Texto del recuadro de un pedido: una línea por dato. */
export function textoRecuadroPedido(p: PedidoDeMovimiento): string {
  return [`Pedido #${p.numero}`, p.factura ? `Factura ${p.factura}` : null, p.negocio ? `Negocio: ${p.negocio}` : null].filter(Boolean).join('\n')
}

function pedidosDe(m: MovimientoSaldoFavorCliente): PedidoDeMovimiento[] {
  if (m.pedido) return [m.pedido]
  return m.cobro?.pedidos ?? []
}

function ChipPedido({ pedidos }: { pedidos: PedidoDeMovimiento[] }) {
  if (pedidos.length === 0) return null
  const [primero, ...resto] = pedidos
  // El recuadro lista hasta 3 pedidos; si hay más, dice cuántos faltan (el desplegable los trae todos).
  const texto = [pedidos.slice(0, 3).map(textoRecuadroPedido).join('\n\n'), pedidos.length > 3 ? `y ${pedidos.length - 3} más` : null].filter(Boolean).join('\n\n')
  return (
    <AyudaTermino
      disparador={resto.length > 0 ? `Pedido #${primero.numero} y ${resto.length} más` : `Pedido #${primero.numero}`}
      texto={texto}
    />
  )
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <dt className="mt-1.5 text-slate-500 sm:mt-0">{etiqueta}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

function Detalle({ m }: { m: MovimientoSaldoFavorCliente }) {
  const cobro = m.cobro
  const recibidoTotal = cobro?.montoRecibido ?? null
  const aplicado = cobro?.montoAplicado ?? null
  return (
    <dl data-testid="saldo-favor-detalle" className="grid gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-y-1.5">
      <Fila etiqueta="Fecha y hora">{fechaLarga(m.fecha)}</Fila>
      {m.tipo === 'ENTRADA_COBRO' && (
        <>
          {m.metodo && <Fila etiqueta="Medio">{METODOS_ETIQUETA[m.metodo] ?? m.metodo}</Fila>}
          {recibidoTotal !== null && aplicado !== null ? (
            <Fila etiqueta="Cobro">
              Se recibieron {formatCurrency(recibidoTotal)}: {formatCurrency(aplicado)} a deuda y{' '}
              <b className="text-teal-700">{formatCurrency(Math.round((recibidoTotal - aplicado) * 100) / 100)} a favor</b>
            </Fila>
          ) : null}
          <Fila etiqueta="Pedidos pagados">
            {cobro === null ? (
              <span className="text-slate-500">Sin dato</span>
            ) : cobro.pedidos.length === 0 ? (
              <span className="text-slate-500">Sin dato</span>
            ) : (
              <ul className="space-y-0.5">
                {cobro.pedidos.map((p) => (
                  <li key={p.id}>
                    #{p.numero}
                    {p.factura ? ` · Factura ${p.factura}` : ''}
                    {p.negocio ? ` · ${p.negocio}` : ''} · {formatCurrency(p.montoAplicado)}
                  </li>
                ))}
              </ul>
            )}
          </Fila>
          {cobro?.recibio && (
            <Fila etiqueta="Recibió el dinero">
              {cobro.recibio.nombre} ({cobro.recibio.quien === 'REPARTIDOR' ? 'repartidor' : 'oficina'}) · {fechaLarga(cobro.recibio.fecha)}
            </Fila>
          )}
        </>
      )}
      {m.tipo !== 'ENTRADA_COBRO' && (
        <>
          {m.pedido && (
            <Fila etiqueta="Pedido">
              #{m.pedido.numero}
              {m.pedido.factura ? ` · Factura ${m.pedido.factura}` : ''}
              {m.pedido.negocio ? ` · ${m.pedido.negocio}` : ''}
            </Fila>
          )}
          {m.motivo && <Fila etiqueta="Motivo">«{m.motivo}»</Fila>}
        </>
      )}
      {m.registro && (
        <Fila etiqueta="Lo registró">
          {m.registro.nombre} <span className="text-slate-500">({ROLES_ETIQUETA[m.registro.rol] ?? m.registro.rol})</span>
        </Fila>
      )}
      {m.referencia && (
        <Fila etiqueta="Referencia">
          <code className="break-all text-[11px]" title="Para soporte">{m.referencia}</code>
        </Fila>
      )}
    </dl>
  )
}

export function MovimientoSaldoFavor({ m, abierto = false }: { m: MovimientoSaldoFavorCliente; abierto?: boolean }) {
  const pedidos = pedidosDe(m)
  const suma = m.signo === 1
  return (
    <details data-testid="saldo-favor-movimiento" open={abierto} className="group border-t border-slate-200 first:border-t-0">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 text-sm font-medium text-slate-900">
          {tituloMovimientoSaldoFavor(m)}
          {pedidos.length > 0 && (
            <>
              {' · '}
              {/* El recuadro no debe abrir ni cerrar el detalle. */}
              <span onClick={(e) => { e.preventDefault(); e.stopPropagation() }} className="inline-block">
                <ChipPedido pedidos={pedidos} />
              </span>
            </>
          )}
        </span>
        <span className={`row-span-2 self-start whitespace-nowrap text-right text-sm font-semibold tabular-nums ${suma ? 'text-teal-700' : 'text-slate-700'}`}>
          {suma ? '+' : '−'} {formatCurrency(m.monto)}
        </span>
        <span className="min-w-0 text-xs text-slate-500">
          {fechaCorta(m.fecha)}
          {m.registro ? ` · Lo registró ${m.registro.nombre}` : ''}
        </span>
        <span className="col-span-2 text-xs text-blue-700">
          <span className="group-open:hidden">Ver detalle ▾</span>
          <span className="hidden group-open:inline">Ocultar detalle ▴</span>
        </span>
      </summary>
      <div className="pb-3">
        <Detalle m={m} />
      </div>
    </details>
  )
}
