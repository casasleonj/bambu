'use client'

// #631/#646 — Cierre de caja: de dónde viene lo cobrado (efectivo vs digital) y, en desplegables cerrados, los abonos y
// correcciones, los gastos, los pagos por confirmar y a quién se fió hoy. Solo explica cifras que el cierre ya tiene
// (no suma ni resta dinero). Lo que está en cero no se muestra.

import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { Desplegable, ListaLimitada } from '@/components/ui/desplegable'
import { formatCurrency } from '@/lib/utils'
import type { PagoPorConfirmarDetalle } from '@/lib/cierre-desglose-cobros'
import type { CierreData } from '@/app/(app)/cierre/cierre-client/types'

const FLAG_CONFIRMACION = process.env.NEXT_PUBLIC_PAGO_CONFIRMACION === 'true'

const NOMBRE_MEDIO: Record<string, string> = {
  EFECTIVO: 'Efectivo', NEQUI: 'Nequi', TRANSFERENCIA: 'Transferencia', DAVIPLATA: 'Daviplata', BONO: 'Bono',
}

/** Qué significa cada tipo de corrección, en palabras sencillas. */
const TIPO_CORRECCION: Record<string, string> = {
  MONTO: 'Se corrigió el monto',
  CLIENTE: 'Se pasó a otro cliente',
  FACTURA: 'Se pasó a otra factura',
  NO_RECIBIDO: 'El dinero nunca llegó',
}

const urlFiadosDe = (clienteId: string | null): string | null =>
  clienteId && clienteId !== 'CONSUMIDOR_FINAL' ? `/pedidos?tab=fiados&clienteId=${encodeURIComponent(clienteId)}` : null
const pagos = (n: number): string => `${n} pago${n === 1 ? '' : 's'}`
const urlPedido = (pedidoId: string): string => `/pedidos?openPedido=${encodeURIComponent(pedidoId)}`

const fechaHora = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const soloHora = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' })
const promesaCorta = (yyyyMmDd: string): string =>
  new Date(`${yyyyMmDd}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })

function Enlace({ href, children, className = '' }: { href: string | null; children: React.ReactNode; className?: string }) {
  if (!href) return <span className={className}>{children}</span>
  return <a href={href} className={`font-semibold text-blue-700 hover:underline ${className}`}>{children}</a>
}

function Fila({ izquierda, detalle, derecha, rojo }: { izquierda: React.ReactNode; detalle?: React.ReactNode; derecha: React.ReactNode; rojo?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <div className="min-w-0">
        <div className="font-semibold text-slate-800">{izquierda}</div>
        {detalle && <div className="mt-0.5 text-[11px] text-slate-500">{detalle}</div>}
      </div>
      <div className={`whitespace-nowrap text-right font-bold tabular-nums ${rojo ? 'text-red-700' : 'text-slate-800'}`}>{derecha}</div>
    </div>
  )
}

function AccionConfirmar({ fila, confirmaPagos }: { fila: PagoPorConfirmarDetalle; confirmaPagos: CierreData['confirmaPagos'] }) {
  if (!FLAG_CONFIRMACION || !confirmaPagos) return null
  if (confirmaPagos.puede) {
    return (
      <a href={`/pagos-confirmar?pedidoId=${encodeURIComponent(fila.pedidoId)}`} data-testid="cierre-confirmar-pago"
        className="inline-flex min-h-[32px] items-center rounded-md border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-800 hover:bg-amber-50">
        Confirmar →
      </a>
    )
  }
  return confirmaPagos.nombre ? <span className="text-[11px] text-slate-500">Lo confirma {confirmaPagos.nombre}</span> : null
}

function GrupoPorConfirmar({ titulo, filas, confirmaPagos, testid }: {
  titulo: string; filas: PagoPorConfirmarDetalle[]; confirmaPagos: CierreData['confirmaPagos']; testid: string
}) {
  if (filas.length === 0) return null
  return (
    <div data-testid={testid} className="mt-2">
      <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</h5>
      <ListaLimitada items={filas} render={(f) => (
        <Fila key={f.pagoId}
          izquierda={<><Enlace href={urlPedido(f.pedidoId)}>#{f.numero}</Enlace> · <Enlace href={urlFiadosDe(f.clienteId)}>{f.cliente}</Enlace></>}
          detalle={<>{f.factura ?? 'Sin factura'} · {fechaHora(f.fecha)} · {NOMBRE_MEDIO[f.metodo] ?? f.metodo}
            <span className="ml-2"><AccionConfirmar fila={f} confirmaPagos={confirmaPagos} /></span></>}
          derecha={formatCurrency(f.monto)} />
      )} />
    </div>
  )
}

export default function CierreDesgloseCobros({ data }: { data: CierreData | null }) {
  if (!data) return null
  const d = data.desgloseCobros
  if (!d) {
    return (
      <div data-testid="cierre-desglose-historico" className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        Este cierre se hizo antes del desglose de cobros. Se muestran solo los totales que guardó.
      </div>
    )
  }

  const hayEfectivo = d.efectivo !== 0
  const hayDigital = d.digital !== 0
  const partes = [
    { clave: 'ventasHoy', etiqueta: 'Ventas de hoy', parte: d.ventasHoy },
    { clave: 'fiadosAnteriores', etiqueta: 'Fiados anteriores cobrados', parte: d.fiadosAnteriores },
    { clave: 'abonos', etiqueta: 'Abonos y correcciones', parte: d.abonos },
  ]
  const mediosDigitales: Record<string, number> = {}
  for (const parte of [d.ventasHoy, d.fiadosAnteriores]) {
    for (const [m, v] of Object.entries(parte.porMetodo)) mediosDigitales[m] = (mediosDigitales[m] ?? 0) + v
  }

  const abonos = data.abonosDelDia?.abonos ?? []
  const correcciones = data.abonosDelDia?.correcciones ?? []
  const netoAbonos = abonos.reduce((t, a) => t + a.monto, 0) - correcciones.reduce((t, c) => t + c.monto, 0)

  const gastos = data.gastosDelDia
  const totalGastos = data.totalGastos ?? 0
  const porCategoria = data.gastosPorCategoria ?? []

  const pc = data.porConfirmar
  const detalleHoy = pc?.detalleHoy ?? []
  const detallePrevios = pc?.detalleDiasPrevios ?? []
  const totalPorConfirmar = (pc?.total ?? 0) + (pc?.diasPreviosTotal ?? 0)
  const cantPorConfirmar = (pc?.count ?? 0) + (pc?.diasPreviosCount ?? 0)

  const fiados = data.fiadosDelDia ?? []
  const totalFiados = fiados.reduce((t, f) => t + f.saldo, 0)

  return (
    <div className="mt-4 space-y-2" data-testid="cierre-desglose">
      {(hayEfectivo || hayDigital) ? (
        <section aria-label="De dónde viene lo cobrado" data-testid="cierre-cobros-origen">
          <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-800">
            De dónde viene lo cobrado
            <AyudaTermino texto="Muestra por qué origen y con qué medio entró el dinero de hoy. Es la misma cifra de «Cobrado hoy», solo explicada." />
          </h3>
          <div className={`grid gap-3 ${hayEfectivo && hayDigital ? 'md:grid-cols-2' : ''}`}>
            {hayEfectivo && (
              <div data-testid="cierre-cobro-efectivo" className="rounded-xl border border-green-200 bg-green-50 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-green-800">💵 Efectivo · entra a la caja</h4>
                <div className="my-1 text-2xl font-extrabold tabular-nums text-green-800">{formatCurrency(d.efectivo)}</div>
                {partes.filter((f) => f.parte.efectivo !== 0).map((f) => (
                  <div key={f.clave} className="flex justify-between border-t border-black/5 py-1 text-xs">
                    <span className="text-slate-600">{f.etiqueta}</span><span className="tabular-nums">{formatCurrency(f.parte.efectivo)}</span>
                  </div>
                ))}
              </div>
            )}
            {hayDigital && (
              <div data-testid="cierre-cobro-digital" className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-800">📱 Digital · entra a cuentas</h4>
                <div className="my-1 text-2xl font-extrabold tabular-nums text-blue-800">{formatCurrency(d.digital)}</div>
                {partes.filter((f) => f.parte.digital !== 0).map((f) => (
                  <div key={f.clave} className="flex justify-between border-t border-black/5 py-1 text-xs">
                    <span className="text-slate-600">{f.etiqueta}</span><span className="tabular-nums">{formatCurrency(f.parte.digital)}</span>
                  </div>
                ))}
                {Object.keys(mediosDigitales).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(mediosDigitales).map(([m, v]) => (
                      <span key={m} className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] text-blue-800">{NOMBRE_MEDIO[m] ?? m} {formatCurrency(v)}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {d.cuadra ? (
            <p data-testid="cierre-desglose-cuadra" className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              ✔ Cuadra con «Cobrado hoy» ({formatCurrency(d.esperado)}).
            </p>
          ) : (
            <p data-testid="cierre-desglose-no-cuadra" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              ⚠ El desglose suma {formatCurrency(d.total)} y «Cobrado hoy» dice {formatCurrency(d.esperado)} (diferencia {formatCurrency(Math.abs(d.diferencia))}). Avísale al administrador.
            </p>
          )}
        </section>
      ) : (
        <p className="text-xs text-slate-500" data-testid="cierre-desglose-sin-cobros">Hoy no hubo cobros.</p>
      )}

      {(abonos.length > 0 || correcciones.length > 0) && (
        <Desplegable testid="cierre-abonos-correcciones" tono="verde" icono="🧾" titulo="Abonos y correcciones de cobros"
          ayuda="Abono: dinero que un cliente pagó a una factura por aparte, no al recibir el pedido. Corrección: se devolvió o cambió parte de un abono. Los abonos suman; las correcciones restan."
          resumen={`${abonos.length} abono${abonos.length === 1 ? '' : 's'} · ${correcciones.length} corrección${correcciones.length === 1 ? '' : 'es'}`}>
          <p className="mb-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
            <b>Abono:</b> dinero que un cliente pagó a una factura <u>por aparte</u>, no al recibir el pedido (por eso no está en los cobros de pedidos).{' '}
            <b>Corrección:</b> se devolvió o cambió parte de un abono porque el monto, el cliente o la factura estaban mal, o porque el dinero nunca llegó.
          </p>
          <ListaLimitada items={abonos} render={(a) => (
            <Fila key={a.abonoId}
              izquierda={<><span className="mr-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800">ABONO</span>{a.cliente}</>}
              detalle={<>{a.numero}{a.factura ? ` · Factura ${a.factura}` : ''}{a.pedidoId && a.pedidoNumero ? <> · pedido <Enlace href={urlPedido(a.pedidoId)}>#{a.pedidoNumero}</Enlace></> : null} · {NOMBRE_MEDIO[a.metodo] ?? a.metodo} · {fechaHora(a.fecha)}</>}
              derecha={`+${formatCurrency(a.monto)}`} />
          )} />
          <ListaLimitada items={correcciones} render={(c) => (
            <Fila key={c.numero} rojo
              izquierda={<><span className="mr-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">CORRECCIÓN</span>{c.cliente}</>}
              detalle={<>{c.numero} sobre el abono {c.abonoNumero} · «{TIPO_CORRECCION[c.tipo] ?? c.tipo}» · motivo: «{c.motivo}» · autorizó: {c.autorizadoPor}</>}
              derecha={`−${formatCurrency(c.monto)}`} />
          )} />
          <div className="mt-1 flex justify-between border-t-2 border-slate-200 pt-2 font-bold text-slate-800">
            <span>Neto de abonos y correcciones</span><span className="tabular-nums">{netoAbonos < 0 ? '−' : '+'}{formatCurrency(Math.abs(netoAbonos))}</span>
          </div>
        </Desplegable>
      )}

      {totalGastos > 0 && (
        <Desplegable id="cierre-gastos" testid="cierre-gastos-del-dia" tono="rojo" icono="💸" titulo="Gastos del día"
          ayuda="Todo lo que se pagó del dinero del día, incluidas la nómina y las compras pequeñas. Cada gasto resta del efectivo que debe haber en la caja."
          resumen={`${gastos ? `${gastos.length} gasto${gastos.length === 1 ? '' : 's'}` : `${porCategoria.reduce((t, g) => t + g.cantidad, 0)} gastos`} · ${formatCurrency(totalGastos)}`}>
          {gastos ? (
            <ListaLimitada items={gastos} render={(g) => (
              <Fila key={g.id} izquierda={g.descripcion}
                detalle={<>{g.categoria} · {soloHora(g.fecha)}{g.registro ? ` · registró: ${g.registro}` : ''}</>}
                derecha={formatCurrency(g.monto)} />
            )} />
          ) : (
            <ListaLimitada items={porCategoria} render={(g) => (
              <Fila key={g.categoria} izquierda={g.categoria} detalle={`${g.cantidad} gasto${g.cantidad === 1 ? '' : 's'}`} derecha={formatCurrency(g.total)} />
            )} />
          )}
          <div className="mt-1 flex justify-between border-t-2 border-slate-200 pt-2 font-bold text-slate-800">
            <span>Total de gastos</span><span className="tabular-nums">{formatCurrency(totalGastos)}</span>
          </div>
        </Desplegable>
      )}

      {cantPorConfirmar > 0 && (detalleHoy.length > 0 || detallePrevios.length > 0) && (
        <Desplegable testid="cierre-por-confirmar" tono="ambar" icono="⏳" titulo="Pagos por confirmar"
          ayuda="Pagos (normalmente por Nequi, transferencia o Daviplata) que alguien reportó pero aún nadie verificó que llegaron. Los de días anteriores son solo un aviso. No bloquean el cierre."
          resumen={(
            <>
              <b data-testid="por-confirmar-total" className="block text-amber-900">Total: {pagos(cantPorConfirmar)} · {formatCurrency(totalPorConfirmar)}</b>
              <span className="mt-0.5 flex flex-wrap gap-1 sm:justify-end">
                <span data-testid="por-confirmar-resumen-hoy" className="whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-800">Hoy · {pc?.count ?? 0} · {formatCurrency(pc?.total ?? 0)}</span>
                <span data-testid="por-confirmar-resumen-previos" className="whitespace-nowrap rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] text-indigo-800">Días anteriores · {pc?.diasPreviosCount ?? 0} · {formatCurrency(pc?.diasPreviosTotal ?? 0)}</span>
              </span>
            </>
          )}>
          <GrupoPorConfirmar titulo={`Cobrados hoy · ${detalleHoy.length}`} filas={detalleHoy} confirmaPagos={data.confirmaPagos} testid="cierre-por-confirmar-hoy" />
          <GrupoPorConfirmar titulo={`De días anteriores · ${pc?.diasPreviosCount ?? detallePrevios.length} (aviso, no bloquea el cierre)`} filas={detallePrevios} confirmaPagos={data.confirmaPagos} testid="cierre-por-confirmar-previos" />
          {(pc?.diasPreviosCount ?? 0) > detallePrevios.length && (
            <p className="mt-2 text-[11px] text-slate-500">Se muestran los {detallePrevios.length} más recientes de {pc?.diasPreviosCount}.</p>
          )}
        </Desplegable>
      )}

      <Desplegable testid="cierre-fiados-del-dia" tono="gris" icono="🧑‍🤝‍🧑" titulo="A quién se fió hoy"
        ayuda={data.valorComercialPedidosDelDia === undefined ? 'Saldo conservado en este cierre histórico con su definición original.' : 'Saldo actual de lo entregado en pedidos de esta fecha. La mercancía pendiente de entrega no se cobra como recibida.'}
        resumen={fiados.length > 0 ? `${fiados.length} pedido${fiados.length === 1 ? '' : 's'} · ${formatCurrency(totalFiados)}` : 'Ninguno'}>
        {fiados.length === 0 ? (
          <p className="text-slate-500">{data.parcialesPorConciliar?.length ? 'No hay deuda identificada en este listado; faltan entregas por conciliar. No significa que la deuda sea cero.' : 'Hoy no se fió ningún pedido. ✔'}</p>
        ) : (
          <ListaLimitada items={fiados} render={(f) => (
            <Fila key={f.pedidoId}
              izquierda={<><Enlace href={urlFiadosDe(f.clienteId)}>{f.cliente}</Enlace>{' '}<Enlace href={urlPedido(f.pedidoId)} className="text-xs !font-normal">#{f.numero}</Enlace></>}
              detalle={<>{f.saldoComercial === undefined
                ? <>{f.pagado > 0 ? `Pagó ${formatCurrency(f.pagado)} de ${formatCurrency(f.total)}` : 'Fiado total'} (registro histórico)</>
                : <>Valor comercial {formatCurrency(f.total)} · pagado {formatCurrency(f.pagado)}{f.saldoComercial > f.saldo ? ` · saldo por mercancía pendiente ${formatCurrency(f.saldoComercial - f.saldo)}` : ''}</>}{' · '}{f.promesaPago ? `promesa de pago: ${promesaCorta(f.promesaPago)}` : 'sin promesa'}</>}
              derecha={formatCurrency(f.saldo)} />
          )} />
        )}
      </Desplegable>
    </div>
  )
}
