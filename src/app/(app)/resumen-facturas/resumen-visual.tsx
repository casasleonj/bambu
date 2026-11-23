'use client'

export type EstadoFactura = 'EMITIDA' | 'PARCIAL' | 'PAGADA' | 'ANULADA'

export interface ItemResumen {
  producto: string
  etiqueta: string
  /** Cantidad entregada: lo que el cliente se llevó. */
  cantidad: number
  cantPedida: number
  precio: number
  subtotal: number
}

export interface PendienteResumen {
  producto: string
  etiqueta: string
  cantidad: number
}

export interface FacturaVisual {
  id: string
  numero: string
  /** Texto ya formateado, p. ej. «02 nov 2026». */
  fechaTxt: string
  total: number
  montoPagado: number
  /** Lo que se debe ahora (exigible: lo entregado menos lo pagado). */
  debe: number
  estado: string
  items: ItemResumen[]
  pendientes: PendienteResumen[]
  pendienteMonto: number
  otrosAjustes: number
  /** `null` = no cuadran con lo pagado: se muestra solo el total abonado. */
  abonos: { fechaTxt: string; monto: number }[] | null
}

export function money(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
}

const ESTADO_UI: Record<string, { texto: string; borde: string; badge: string }> = {
  PAGADA: { texto: 'Pagada', borde: 'border-l-green-700', badge: 'bg-green-100 text-green-800' },
  PARCIAL: { texto: 'Pago parcial', borde: 'border-l-amber-600', badge: 'bg-amber-100 text-amber-900' },
  EMITIDA: { texto: 'Sin pagar', borde: 'border-l-blue-600', badge: 'bg-blue-100 text-blue-900' },
  ANULADA: { texto: 'Anulada · no suma', borde: 'border-l-gray-400', badge: 'bg-gray-200 text-gray-700' },
}

export interface HeroDato {
  etiqueta: string
  /** Ya formateado para mostrar. */
  texto: string
}

interface HeroProps {
  etiqueta: string
  monto: number
  tono: 'debe' | 'alDia' | 'neutro'
  nota: string
  datos: HeroDato[]
}

const COLOR_TONO: Record<HeroProps['tono'], string> = {
  debe: 'text-red-700',
  alDia: 'text-green-700',
  neutro: 'text-gray-600',
}

/**
 * Cifra principal del documento según lo que se consulta (#977). Se imprime y se
 * comparte igual que en pantalla: sin barra «pagado/facturado» que mezcle facturas
 * de otro estado.
 */
export function ResumenHero({ etiqueta, monto, tono, nota, datos }: HeroProps) {
  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 grid gap-4 md:grid-cols-2 items-center print:break-inside-avoid"
      data-testid="resumen-hero"
      aria-label={etiqueta}
    >
      <div>
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{etiqueta}</p>
        <p className={`text-4xl sm:text-5xl font-extrabold leading-tight mt-1 ${COLOR_TONO[tono]}`} data-testid="resumen-hero-monto">
          {money(monto)}
        </p>
        <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{nota}</p>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 md:justify-end">
        {datos.map((d) => (
          <div key={d.etiqueta}>
            <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{d.etiqueta}</dt>
            <dd className="text-2xl font-extrabold text-gray-900">{d.texto}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Factura como tarjeta: número, fecha, estado, total y lo que debe; debajo, lo
 * que se llevó (cantidad × producto, a cuánto se cobró cada uno y subtotal).
 * Siempre visible: es el mismo documento que recibe el cliente.
 */
export function FacturaCard({ factura }: { factura: FacturaVisual }) {
  const anulada = factura.estado === 'ANULADA'
  const ui = ESTADO_UI[factura.estado] ?? ESTADO_UI.EMITIDA
  const pct = anulada || factura.total <= 0 ? 0 : Math.min(100, Math.round((factura.montoPagado / factura.total) * 100))
  const estadoTxt = factura.estado === 'PARCIAL' ? `${ui.texto} · ${pct}%` : ui.texto

  return (
    <div
      className={`rounded-xl border border-gray-200 border-l-[6px] ${ui.borde} ${anulada ? 'bg-gray-50' : 'bg-white'} px-4 py-3 print:break-inside-avoid`}
      data-testid={`resumen-fila-${factura.numero}`}
    >
      <div className="grid gap-x-4 gap-y-1 grid-cols-2 sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-center">
        <div className="col-span-2 sm:col-span-1">
          <span className={`font-bold text-gray-900 ${anulada ? 'line-through text-gray-500' : ''}`}>{factura.numero}</span>
          <span className="text-xs text-gray-600 ml-2">{factura.fechaTxt}</span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${ui.badge}`}>{estadoTxt}</span>
        </div>
        <div className="text-xs text-gray-600 sm:text-right">
          Total
          <br />
          <strong className="text-sm text-gray-900">{money(factura.total)}</strong>
        </div>
        <div className="text-xs text-gray-600 text-right sm:min-w-28">
          {anulada ? 'Saldo' : 'Debe'}
          <br />
          <strong className={`text-base ${anulada ? 'text-gray-500' : factura.debe > 0 ? 'text-red-700' : 'text-green-700'}`}>
            {anulada ? '—' : money(factura.debe)}
          </strong>
        </div>
      </div>

      <div className="mt-2 border-t border-dashed border-gray-300 pt-2" data-testid={`resumen-detalle-${factura.numero}`}>
        {factura.items.length === 0 ? (
          <p className="text-sm text-gray-600">Esta factura no tiene productos entregados registrados.</p>
        ) : (
          <ul className="space-y-1">
            {factura.items.map((it) => (
              <li
                key={it.producto}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.6fr)_9rem_7rem] gap-x-3 text-sm"
                data-testid={`resumen-item-${factura.numero}-${it.producto}`}
              >
                <span>
                  <strong>{it.cantidad} ×</strong> {it.etiqueta}
                  <span className="block text-xs text-gray-600 sm:hidden">{money(it.precio)} c/u</span>
                </span>
                <span className="hidden sm:block text-right text-gray-600">{money(it.precio)} c/u</span>
                <span className="text-right self-center">{money(it.subtotal)}</span>
              </li>
            ))}
            {factura.otrosAjustes !== 0 && (
              <li className="grid grid-cols-[1fr_auto] text-sm text-gray-700" data-testid="resumen-otros-ajustes">
                <span>Otros ajustes</span>
                <span className="text-right">{money(factura.otrosAjustes)}</span>
              </li>
            )}
          </ul>
        )}
        {factura.pendientes.length > 0 && (
          <p className="mt-2 text-xs text-amber-900" data-testid={`resumen-pendiente-${factura.numero}`}>
            Falta entregar: {factura.pendientes.map((p) => `${p.cantidad} × ${p.etiqueta}`).join(', ')}. Su valor ({money(factura.pendienteMonto)}) aún no se cobra: solo se debe lo entregado.
          </p>
        )}
        {!anulada && factura.montoPagado > 0 && (
          <p className="mt-1 text-xs text-gray-700" data-testid={`resumen-abonos-${factura.numero}`}>
            {factura.abonos && factura.abonos.length > 0
              ? `Abonos: ${factura.abonos.map((a) => `${money(a.monto)} el ${a.fechaTxt}`).join(' · ')}.`
              : `Total abonado: ${money(factura.montoPagado)}.`}
          </p>
        )}
      </div>
    </div>
  )
}
