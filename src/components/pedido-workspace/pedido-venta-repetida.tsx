'use client'

import { AlertTriangle } from 'lucide-react'

export interface VentaRepetidaAviso {
  id: string
  numero: number
  haceSegundos: number
}

/**
 * #408 (maqueta C aprobada): aviso de posible venta repetida. NO bloquea: el usuario marca «Es otra venta
 * distinta, quiero continuar» para poder guardar. La casilla es obligatoria solo mientras el aviso está.
 */
export function PedidoVentaRepetida({
  aviso,
  confirmada,
  onConfirmadaChange,
  disabled,
}: {
  aviso: VentaRepetidaAviso
  confirmada: boolean
  onConfirmadaChange: (value: boolean) => void
  disabled?: boolean
}) {
  const hace = aviso.haceSegundos === 1 ? 'Hace 1 segundo' : `Hace ${aviso.haceSegundos} segundos`
  return (
    <section data-testid="venta-repetida" role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-amber-900">Parece una venta repetida</p>
          <p className="mt-1 text-sm text-amber-900" data-testid="venta-repetida-texto">
            {hace} se registró la venta <strong>#{aviso.numero}</strong> con el mismo cliente, los mismos productos y el mismo total.{' '}
            <a
              href={`/pedidos?openPedido=${encodeURIComponent(aviso.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
              data-testid="venta-repetida-ver"
            >
              Ver la #{aviso.numero}
            </a>
          </p>
        </div>
      </div>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0"
          checked={confirmada}
          disabled={disabled}
          onChange={(e) => onConfirmadaChange(e.target.checked)}
          data-testid="venta-repetida-confirmar"
        />
        Es otra venta distinta, quiero continuar
      </label>
    </section>
  )
}
