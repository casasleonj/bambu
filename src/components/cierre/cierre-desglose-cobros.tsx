'use client'

// #631 — Cierre de caja: de dónde viene lo cobrado (origen × medio), pagos digitales por confirmar y a quién se fió hoy.
// Solo explica cifras que el cierre ya tiene (no suma ni resta dinero). Lo que está en cero no se muestra.

import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { formatCurrency } from '@/lib/utils'
import type { PagoPorConfirmarDetalle } from '@/lib/cierre-desglose-cobros'
import type { CierreData } from '@/app/(app)/cierre/cierre-client/types'

const FLAG_CONFIRMACION = process.env.NEXT_PUBLIC_PAGO_CONFIRMACION === 'true'

const NOMBRE_MEDIO: Record<string, string> = {
  NEQUI: 'Nequi', TRANSFERENCIA: 'Transferencia', DAVIPLATA: 'Daviplata', BONO: 'Bono',
}

const urlFiadosDe = (clienteId: string | null): string | null =>
  clienteId && clienteId !== 'CONSUMIDOR_FINAL' ? `/pedidos?tab=fiados&clienteId=${encodeURIComponent(clienteId)}` : null
const urlPedido = (pedidoId: string): string => `/pedidos?openPedido=${encodeURIComponent(pedidoId)}`

const fechaCorta = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const promesaCorta = (yyyyMmDd: string): string =>
  new Date(`${yyyyMmDd}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' })

function Enlace({ href, children, className = '' }: { href: string | null; children: React.ReactNode; className?: string }) {
  if (!href) return <span className={className}>{children}</span>
  return <a href={href} className={`font-semibold text-blue-700 hover:underline ${className}`}>{children}</a>
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
  return confirmaPagos.nombre ? <span className="text-xs text-slate-500">Lo confirma {confirmaPagos.nombre}</span> : null
}

function GrupoPorConfirmar({ titulo, filas, confirmaPagos, testid }: {
  titulo: string; filas: PagoPorConfirmarDetalle[]; confirmaPagos: CierreData['confirmaPagos']; testid: string
}) {
  if (filas.length === 0) return null
  return (
    <div data-testid={testid} className="mt-3">
      <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</h5>
      <table className="mt-1 hidden w-full text-xs md:table">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-2 font-medium">Pedido</th><th className="py-1 pr-2 font-medium">Cliente</th>
            <th className="py-1 pr-2 font-medium">Factura</th><th className="py-1 pr-2 font-medium">Fecha</th>
            <th className="py-1 pr-2 font-medium">Medio</th><th className="py-1 pr-2 text-right font-medium">Monto</th><th />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.pagoId} className="border-t border-amber-100 bg-white/60">
              <td className="py-1.5 pr-2"><Enlace href={urlPedido(f.pedidoId)}>#{f.numero}</Enlace></td>
              <td className="py-1.5 pr-2"><Enlace href={urlFiadosDe(f.clienteId)}>{f.cliente}</Enlace></td>
              <td className="py-1.5 pr-2">{f.factura ?? '—'}</td>
              <td className="py-1.5 pr-2 whitespace-nowrap">{fechaCorta(f.fecha)}</td>
              <td className="py-1.5 pr-2">{NOMBRE_MEDIO[f.metodo] ?? f.metodo}</td>
              <td className="py-1.5 pr-2 text-right font-medium tabular-nums">{formatCurrency(f.monto)}</td>
              <td className="py-1.5 text-right"><AccionConfirmar fila={f} confirmaPagos={confirmaPagos} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-1 space-y-1.5 md:hidden">
        {filas.map((f) => (
          <li key={f.pagoId} className="rounded-lg border border-amber-200 bg-white p-2 text-xs">
            <div className="flex justify-between gap-2 font-semibold">
              <span><Enlace href={urlPedido(f.pedidoId)}>#{f.numero}</Enlace> · <Enlace href={urlFiadosDe(f.clienteId)}>{f.cliente}</Enlace></span>
              <span className="tabular-nums">{formatCurrency(f.monto)}</span>
            </div>
            <div className="text-slate-500">{f.factura ?? 'Sin factura'} · {fechaCorta(f.fecha)} · {NOMBRE_MEDIO[f.metodo] ?? f.metodo}</div>
            <div className="mt-1"><AccionConfirmar fila={f} confirmaPagos={confirmaPagos} /></div>
          </li>
        ))}
      </ul>
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

  const filasOrigen = [
    { clave: 'ventasHoy', etiqueta: 'Ventas de hoy cobradas hoy', parte: d.ventasHoy },
    { clave: 'fiadosAnteriores', etiqueta: 'Fiados de días anteriores cobrados hoy', parte: d.fiadosAnteriores },
    { clave: 'abonos', etiqueta: 'Abonos y ajustes de cobros', parte: d.abonos },
  ].filter((f) => f.parte.total !== 0 || f.parte.efectivo !== 0 || f.parte.digital !== 0)

  const mediosDigitales: Record<string, number> = {}
  for (const parte of [d.ventasHoy, d.fiadosAnteriores]) {
    for (const [m, v] of Object.entries(parte.porMetodo)) mediosDigitales[m] = (mediosDigitales[m] ?? 0) + v
  }
  const hayEfectivo = d.efectivo !== 0
  const hayDigital = d.digital !== 0
  const pc = data.porConfirmar
  const detalleHoy = pc?.detalleHoy ?? []
  const detallePrevios = pc?.detalleDiasPrevios ?? []
  const totalPorConfirmar = (pc?.total ?? 0) + (pc?.diasPreviosTotal ?? 0)
  const cantPorConfirmar = (pc?.count ?? 0) + (pc?.diasPreviosCount ?? 0)
  const fiados = data.fiadosDelDia ?? []
  const totalFiados = fiados.reduce((t, f) => t + f.saldo, 0)

  return (
    <div className="mt-4 space-y-4" data-testid="cierre-desglose">
      <section className="rounded-xl border border-slate-200 p-4" aria-labelledby="cierre-desglose-titulo">
        <h3 id="cierre-desglose-titulo" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          De dónde viene lo cobrado
          <AyudaTermino texto="Muestra por qué origen y con qué medio entró el dinero de hoy. Es la misma cifra de «Cobros de la fecha», solo explicada." />
        </h3>

        {filasOrigen.length === 0 ? (
          <p className="text-xs text-slate-500" data-testid="cierre-desglose-sin-cobros">Hoy no hubo cobros.</p>
        ) : (
          <>
            <div className={`grid gap-3 ${hayEfectivo && hayDigital ? 'md:grid-cols-2' : ''}`}>
              {hayEfectivo && (
                <div data-testid="cierre-cobro-efectivo" className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-800">💵 Efectivo · entra a la caja</h4>
                  <div className="my-1 text-xl font-bold tabular-nums text-green-800">{formatCurrency(d.efectivo)}</div>
                  {filasOrigen.filter((f) => f.parte.efectivo !== 0).map((f) => (
                    <div key={f.clave} className="flex justify-between border-t border-black/5 py-1 text-xs">
                      <span className="text-slate-600">{f.clave === 'ventasHoy' ? 'Ventas de hoy' : f.clave === 'fiadosAnteriores' ? 'Fiados anteriores cobrados' : 'Abonos y ajustes'}</span>
                      <span className="tabular-nums">{formatCurrency(f.parte.efectivo)}</span>
                    </div>
                  ))}
                </div>
              )}
              {hayDigital && (
                <div data-testid="cierre-cobro-digital" className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-800">📱 Digital · entra a cuentas</h4>
                  <div className="my-1 text-xl font-bold tabular-nums text-blue-800">{formatCurrency(d.digital)}</div>
                  {filasOrigen.filter((f) => f.parte.digital !== 0).map((f) => (
                    <div key={f.clave} className="flex justify-between border-t border-black/5 py-1 text-xs">
                      <span className="text-slate-600">{f.clave === 'ventasHoy' ? 'Ventas de hoy' : f.clave === 'fiadosAnteriores' ? 'Fiados anteriores cobrados' : 'Abonos y ajustes'}</span>
                      <span className="tabular-nums">{formatCurrency(f.parte.digital)}</span>
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

            <table className="mt-3 hidden w-full text-xs md:table" data-testid="cierre-desglose-tabla">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-1 text-left font-medium">Origen</th>
                  {hayEfectivo && <th className="py-1 text-right font-medium">💵 Efectivo</th>}
                  {hayDigital && <th className="py-1 text-right font-medium">📱 Digital</th>}
                  <th className="py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {filasOrigen.map((f) => (
                  <tr key={f.clave} className="border-t border-slate-100">
                    <td className="py-1.5">{f.etiqueta}</td>
                    {hayEfectivo && <td className="py-1.5 text-right font-semibold tabular-nums text-green-700">{formatCurrency(f.parte.efectivo)}</td>}
                    {hayDigital && <td className="py-1.5 text-right font-semibold tabular-nums text-blue-700">{formatCurrency(f.parte.digital)}</td>}
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(f.parte.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 font-bold">
                  <td className="py-1.5">Total cobrado</td>
                  {hayEfectivo && <td className="py-1.5 text-right tabular-nums text-green-700">{formatCurrency(d.efectivo)}</td>}
                  {hayDigital && <td className="py-1.5 text-right tabular-nums text-blue-700">{formatCurrency(d.digital)}</td>}
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(d.total)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {d.cuadra ? (
          <div data-testid="cierre-desglose-cuadra" className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
            ✔ Cuadra con «Cobros de la fecha» ({formatCurrency(d.esperado)}).
          </div>
        ) : (
          <div data-testid="cierre-desglose-no-cuadra" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            ⚠ El desglose suma {formatCurrency(d.total)} y «Cobros de la fecha» dice {formatCurrency(d.esperado)} (diferencia {formatCurrency(Math.abs(d.diferencia))}). Avísale al administrador.
          </div>
        )}

        {cantPorConfirmar > 0 && (detalleHoy.length > 0 || detallePrevios.length > 0) && (
          <details open className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="cierre-por-confirmar">
            <summary className="cursor-pointer text-sm font-semibold text-amber-800">
              ⏳ Pagos por confirmar · {cantPorConfirmar} · {formatCurrency(totalPorConfirmar)}{' '}
              <AyudaTermino texto="Pagos (normalmente por Nequi, transferencia o Daviplata) que alguien reportó pero aún nadie verificó que llegaron. No bloquean el cierre." />
            </summary>
            <GrupoPorConfirmar titulo={`Cobrados hoy · ${detalleHoy.length}`} filas={detalleHoy} confirmaPagos={data.confirmaPagos} testid="cierre-por-confirmar-hoy" />
            <GrupoPorConfirmar titulo={`De días anteriores · ${pc?.diasPreviosCount ?? detallePrevios.length} (aviso, no bloquea el cierre)`} filas={detallePrevios} confirmaPagos={data.confirmaPagos} testid="cierre-por-confirmar-previos" />
            {(pc?.diasPreviosCount ?? 0) > detallePrevios.length && (
              <p className="mt-2 text-xs text-slate-500">Se muestran los {detallePrevios.length} más recientes de {pc?.diasPreviosCount}.</p>
            )}
          </details>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 p-4" aria-labelledby="cierre-fiados-titulo" data-testid="cierre-fiados-del-dia">
        <h3 id="cierre-fiados-titulo" className="mb-2 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-slate-800">
          A quién se fió hoy
          {fiados.length > 0 && <span className="text-xs font-normal text-slate-500">· {fiados.length} pedido{fiados.length === 1 ? '' : 's'} · {formatCurrency(totalFiados)}</span>}
          <AyudaTermino texto="Pedidos de hoy que quedaron con saldo pendiente, aunque el cliente haya pagado una parte." />
        </h3>
        {fiados.length === 0 ? (
          <p className="text-xs text-slate-500">Hoy no se fió ningún pedido. ✔</p>
        ) : (
          <ul>
            {fiados.map((f) => (
              <li key={f.pedidoId} className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
                <div className="min-w-0">
                  <div>
                    <Enlace href={urlFiadosDe(f.clienteId)}>{f.cliente}</Enlace>{' '}
                    <Enlace href={urlPedido(f.pedidoId)} className="text-xs !font-normal">#{f.numero}</Enlace>
                  </div>
                  <div className="text-xs text-slate-500">
                    {f.pagado > 0 ? `Pagó ${formatCurrency(f.pagado)} de ${formatCurrency(f.total)}` : 'Fiado total'}
                    {' · '}{f.promesaPago ? `promesa de pago: ${promesaCorta(f.promesaPago)}` : 'sin promesa'}
                  </div>
                </div>
                <div className="whitespace-nowrap font-bold tabular-nums">{formatCurrency(f.saldo)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
