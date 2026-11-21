'use client'

import { formatCurrency } from '@/lib/utils'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { ResumenFiadosAnteriores } from '@/lib/fiados-anteriores-pedido'

/**
 * #932: indicador informativo de OTROS pedidos del mismo cliente con fiado.
 * <details> permite tocar el badge en móvil y abrirlo con teclado.
 * El hover de escritorio funciona sin depender de JavaScript adicional.
 *
 * IMPORTANTE: «productos asociados» no equivale a unidades contablemente
 * impagas; los abonos de un fiado se aplican por importe, no por producto.
 */
export function FiadosAnterioresBadge({
  resumen,
  pedidoId,
  clienteId,
}: {
  resumen: ResumenFiadosAnteriores | undefined
  pedidoId: string
  clienteId: string
}) {
  if (!resumen || resumen.total <= 0) return null

  const productos = resumen.productos.map(p =>
    `${p.cantidad} ${getProductoIconConfig(p.producto).label}`)
  const negocios = resumen.negocios.length
    ? `Deuda originada en: ${resumen.negocios.join(', ')}`
    : null
  const titulo = [
    `Fiados de pedidos anteriores: ${formatCurrency(resumen.total)}`,
    `${resumen.pedidos} pedido(s) con deuda pendiente`,
    `Productos entregados asociados: ${productos.join(', ') || 'Sin desglose verificable'}`,
    negocios,
  ].filter(Boolean).join('\n')

  return (
    <details
      className="group relative my-1 inline-block max-w-full align-middle"
      data-testid={`fiados-anteriores-${pedidoId}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <summary
        className="inline-flex max-w-full cursor-pointer list-none items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden"
        title={titulo}
        aria-label={`Fiados anteriores del cliente: ${formatCurrency(resumen.total)} pendientes de cobro. Ver detalles.`}
      >
        <span aria-hidden="true">💰</span>
        <span>Fiados anteriores</span>
      </summary>
      <div
        className="absolute left-0 top-full z-50 mt-1 hidden w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-amber-300 bg-white p-3 text-left text-xs font-normal text-stone-800 shadow-xl group-hover:block group-focus-within:block group-open:block"
        role="note"
      >
        <p className="font-semibold">Cobro de pedidos anteriores</p>
        <p className="mt-1">Total por cobrar: <strong>{formatCurrency(resumen.total)}</strong></p>
        <p className="mt-1">{resumen.pedidos} pedido{resumen.pedidos === 1 ? '' : 's'} con deuda</p>
        <p className="mt-2 font-semibold">Productos entregados asociados</p>
        {productos.length ? (
          <ul className="mt-1 list-inside list-disc">
            {resumen.productos.map(p => (
              <li key={p.producto}>
                {p.cantidad} {getProductoIconConfig(p.producto).label}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-stone-600">Sin desglose verificable</p>}
        {negocios && <p className="mt-2 break-words text-stone-600">{negocios}</p>}
        <a
          href={`/pedidos?tab=fiados&fiadosCliente=${encodeURIComponent(clienteId)}`}
          className="mt-2 inline-flex min-h-8 items-center rounded-md border border-amber-300 px-2 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          Ver fiados del cliente
        </a>
        <p className="mt-2 text-[11px] text-stone-500">
          Las cantidades indican productos entregados en pedidos con deuda,
          no unidades individuales sin pagar.
        </p>
      </div>
    </details>
  )
}
