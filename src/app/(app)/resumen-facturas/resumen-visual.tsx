'use client'

import { useState } from 'react'

export type EstadoFactura = 'EMITIDA' | 'PARCIAL' | 'PAGADA' | 'ANULADA'

export interface ItemResumen {
  producto: string
  etiqueta: string
  cantidad: number
  cantEntrega: number
  precio: number
  subtotal: number
}

export interface FacturaVisual {
  id: string
  numero: string
  /** Texto ya formateado, p. ej. «02 nov 2026». */
  fechaTxt: string
  total: number
  montoPagado: number
  saldo: number
  estado: string
  items: ItemResumen[]
  otrosAjustes: number
}

function money(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

const ESTADO_UI: Record<string, { texto: string; borde: string; badge: string }> = {
  PAGADA: { texto: 'Pagada', borde: 'border-l-green-700', badge: 'bg-green-100 text-green-800' },
  PARCIAL: { texto: 'Parcial · debe', borde: 'border-l-amber-600', badge: 'bg-amber-100 text-amber-800' },
  EMITIDA: { texto: 'Emitida · sin pagar', borde: 'border-l-blue-600', badge: 'bg-blue-100 text-blue-800' },
  ANULADA: { texto: 'Anulada · no suma', borde: 'border-l-gray-400', badge: 'bg-gray-200 text-gray-700' },
}

interface HeroProps {
  soloAnuladas: boolean
  totales: { total: number; totalPagado: number; saldo: number; count: number }
  anuladasTotal: number
  /** Facturas vigentes con saldo > 0, para la frase «qué facturas lo componen». */
  conSaldo: { numero: string; saldo: number }[]
}

/** Lo que se debe, en grande, con barra pagado/falta (#867). */
export function ResumenHero({ soloAnuladas, totales, anuladasTotal, conSaldo }: HeroProps) {
  const pct = totales.total > 0 ? Math.round((totales.totalPagado / totales.total) * 100) : 0
  const etiqueta = soloAnuladas ? 'Anuladas (no suman)' : 'Saldo que se debe'
  const monto = soloAnuladas ? anuladasTotal : totales.saldo
  const color = soloAnuladas ? 'text-gray-600' : totales.saldo > 0 ? 'text-red-700' : 'text-green-700'
  const nota = soloAnuladas
    ? 'Importe histórico de facturas anuladas. No es venta vigente ni deuda cobrable.'
    : totales.saldo > 0
      ? `${conSaldo.length} factura${conSaldo.length === 1 ? '' : 's'} con saldo: ${conSaldo
          .map((f) => `${f.numero} (${money(f.saldo)})`)
          .join(' · ')}`
      : 'Todo al día. No hay saldo pendiente.'

  return (
    <section
      className="bg-white rounded-2xl shadow p-5 sm:p-6 grid gap-5 md:grid-cols-2 items-center print:hidden"
      data-testid="resumen-hero"
      aria-label="Resumen de lo que se debe"
    >
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{etiqueta}</p>
        <p className={`text-4xl sm:text-5xl font-extrabold leading-tight mt-1 ${color}`} data-testid="resumen-hero-monto">
          {money(monto)}
        </p>
        <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{nota}</p>
      </div>
      {!soloAnuladas && (
        <div>
          <div
            className="flex h-4 rounded-full overflow-hidden bg-gray-200"
            role="img"
            aria-label={`Pagado ${pct} por ciento`}
          >
            <div className="bg-green-700" style={{ width: `${pct}%` }} />
            <div className="bg-red-600" style={{ width: `${totales.total > 0 ? 100 - pct : 0}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-sm font-semibold">
            <span className="text-green-700">Pagado {money(totales.totalPagado)}</span>
            <span className="text-red-700">Falta {money(totales.saldo)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            De {money(totales.total)} facturados en {totales.count} factura{totales.count === 1 ? '' : 's'}
          </p>
        </div>
      )}
    </section>
  )
}

/** Factura como tarjeta: estado por color y texto, barra de pagado y detalle de productos al abrir. */
export function FacturaCard({ factura, abiertaInicial = false }: { factura: FacturaVisual; abiertaInicial?: boolean }) {
  const [abierta, setAbierta] = useState(abiertaInicial)
  const anulada = factura.estado === 'ANULADA'
  const ui = ESTADO_UI[factura.estado] ?? ESTADO_UI.EMITIDA
  const pct = anulada || factura.total <= 0 ? 0 : Math.min(100, Math.round((factura.montoPagado / factura.total) * 100))
  const panelId = `detalle-${factura.id}`

  return (
    <div
      className={`rounded-xl shadow border-l-[6px] ${ui.borde} ${anulada ? 'bg-gray-50 opacity-90' : 'bg-white'} print:hidden`}
      data-testid={`resumen-fila-${factura.numero}`}
    >
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        aria-controls={panelId}
        className="w-full text-left p-4 grid gap-3 sm:grid-cols-[1.2fr_1fr_auto_auto] sm:items-center min-h-11"
      >
        <span>
          <span className={`font-bold ${anulada ? 'line-through text-gray-500' : 'text-gray-900'}`}>{factura.numero}</span>
          <span className="text-xs text-gray-500 ml-2">{factura.fechaTxt}</span>
          <span className={`inline-block mt-1 ml-0 sm:ml-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${ui.badge} sm:block sm:w-fit`}>
            {ui.texto}
          </span>
        </span>
        <span className="block">
          <span className="block h-2 rounded-full bg-gray-200 overflow-hidden">
            <span className="block h-2 bg-green-700" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-xs text-gray-500">{anulada ? 'No aplica' : `${pct}% pagado`}</span>
        </span>
        <span className="text-sm text-gray-600 sm:text-right">
          Total
          <br />
          <strong className="text-gray-900">{money(factura.total)}</strong>
        </span>
        <span className="text-sm text-gray-600 sm:text-right sm:min-w-28">
          {anulada ? 'Saldo' : 'Debe'}
          <br />
          <strong className={anulada ? 'text-gray-500' : factura.saldo > 0 ? 'text-red-700' : 'text-green-700'}>
            {anulada ? '—' : money(factura.saldo)}
          </strong>
          <span className="sr-only">{abierta ? ' Ocultar productos' : ' Ver productos'}</span>
          <span aria-hidden="true" className="ml-2 text-gray-400">{abierta ? '▾' : '▸'}</span>
        </span>
      </button>

      {abierta && (
        <div id={panelId} className="border-t border-gray-200 px-4 py-3" data-testid={`resumen-detalle-${factura.numero}`}>
          {factura.items.length === 0 ? (
            <p className="text-sm text-gray-500">Esta factura no tiene productos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="py-1.5 pr-2">Producto</th>
                    <th className="py-1.5 px-2 text-right">Cantidad</th>
                    <th className="py-1.5 px-2 text-right hidden sm:table-cell">Precio</th>
                    <th className="py-1.5 pl-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {factura.items.map((it) => (
                    <tr key={it.producto} className="border-t border-gray-100">
                      <td className="py-2 pr-2">{it.etiqueta}</td>
                      <td className="py-2 px-2 text-right font-semibold">
                        × {it.cantidad}
                        {it.cantEntrega < it.cantidad && (
                          <span className="block text-xs font-normal text-gray-500">entregadas {it.cantEntrega}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600 hidden sm:table-cell">{money(it.precio)} c/u</td>
                      <td className="py-2 pl-2 text-right">{money(it.subtotal)}</td>
                    </tr>
                  ))}
                  {factura.otrosAjustes !== 0 && (
                    <tr className="border-t border-gray-100 text-gray-600" data-testid="resumen-otros-ajustes">
                      <td className="py-2 pr-2" colSpan={3}>Otros ajustes</td>
                      <td className="py-2 pl-2 text-right">{money(factura.otrosAjustes)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-gray-700 mt-2">
            {anulada
              ? 'Anulada: no suma a ventas ni a la deuda.'
              : factura.montoPagado > 0
                ? `Pagado ${money(factura.montoPagado)} de ${money(factura.total)}.`
                : 'Sin pagos registrados todavía.'}
          </p>
        </div>
      )}
    </div>
  )
}
