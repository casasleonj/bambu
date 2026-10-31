'use client'

// TEMPORAL-SIN-EMBARQUE(#535): zona de la «venta en ruta» en el workspace de Pedidos.
// El repartidor que vendió es obligatorio (de él cuenta la comisión sin embarque) y, si un
// cliente real queda debiendo, hay que decir hasta cuándo promete pagar. Todo lo demás
// (productos, cobro, crédito) es el workspace de siempre.

export interface RepartidorVentaRuta {
  id: string
  nombre: string
}

interface Props {
  repartidores: RepartidorVentaRuta[]
  vendidoPorId: string
  onVendidoPorChange: (id: string) => void
  /** ¿un cliente real queda debiendo? Solo entonces se pide la promesa de pago. */
  pideFecha: boolean
  promesaPagoFecha: string
  onPromesaChange: (fecha: string) => void
  /** Fecha mínima (hoy en Bogotá, YYYY-MM-DD). */
  hoy: string
  disabled?: boolean
  /** Se marca el error solo después de un intento de registrar. */
  mostrarErrores?: boolean
}

export function WorkspaceVentaEnRuta({
  repartidores, vendidoPorId, onVendidoPorChange, pideFecha, promesaPagoFecha, onPromesaChange, hoy, disabled, mostrarErrores,
}: Props) {
  const falta = mostrarErrores && !vendidoPorId
  const faltaFecha = mostrarErrores && pideFecha && !promesaPagoFecha
  return (
    <section data-testid="workspace-venta-en-ruta" className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-3">
      <div className="text-sm font-medium text-emerald-900">Venta en ruta — sin pedido previo</div>
      <p className="text-xs text-emerald-800">
        Queda entregada hoy y entra a la caja del día. Con el repartidor anotado se le cuenta la comisión.
      </p>

      <div>
        <label htmlFor="venta-ruta-repartidor" className="mb-1 block text-xs font-semibold text-gray-700">
          ¿Quién la vendió? *
        </label>
        <select
          id="venta-ruta-repartidor"
          data-testid="venta-ruta-repartidor"
          value={vendidoPorId}
          disabled={disabled}
          onChange={(e) => onVendidoPorChange(e.target.value)}
          aria-invalid={falta ? true : undefined}
          className={`min-h-11 w-full rounded-lg border bg-white px-3 text-sm ${falta ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
        >
          <option value="">Elige al repartidor…</option>
          {repartidores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        {repartidores.length === 0 && (
          <p className="mt-1 text-xs text-amber-700" data-testid="venta-ruta-sin-repartidores">
            No hay repartidores activos con moto. Agrega uno en Trabajadores para poder registrar la venta.
          </p>
        )}
        {falta && <p className="mt-1 text-xs text-red-700" role="alert">Elige quién la vendió.</p>}
      </div>

      {pideFecha && (
        <div>
          <label htmlFor="venta-ruta-promesa" className="mb-1 block text-xs font-semibold text-gray-700">
            ¿Hasta cuándo promete pagar? *
          </label>
          <input
            id="venta-ruta-promesa"
            data-testid="venta-ruta-promesa"
            type="date"
            min={hoy}
            value={promesaPagoFecha}
            disabled={disabled}
            onChange={(e) => onPromesaChange(e.target.value)}
            aria-invalid={faltaFecha ? true : undefined}
            className={`min-h-11 w-full rounded-lg border bg-white px-3 text-sm ${faltaFecha ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
          />
          {faltaFecha && <p className="mt-1 text-xs text-red-700" role="alert">Falta la fecha de la promesa de pago.</p>}
        </div>
      )}
    </section>
  )
}
