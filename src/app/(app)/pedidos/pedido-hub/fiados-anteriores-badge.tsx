'use client'

import { useEffect, useRef } from 'react'
import { formatCurrency } from '@/lib/utils'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { ResumenFiadosAnteriores } from '@/lib/fiados-anteriores-pedido'

/**
 * #932: aviso de COBROS PENDIENTES DE OTROS PEDIDOS del titular.
 * No afirma que el pedido de origen sea más antiguo o que el dinero ya esté
 * conciliado. El panel se despliega inline en móvil para evitar overflow.
 */
export function FiadosAnterioresBadge({
  resumen,
  pedidoId,
  clienteId,
  consultaError = false,
}: {
  resumen: ResumenFiadosAnteriores | undefined
  pedidoId: string
  clienteId: string
  consultaError?: boolean
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const desplegable = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const cerrarFuera = (evento: PointerEvent) => {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node) && desplegable.current) {
        desplegable.current.open = false
      }
    }
    const cerrarEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && desplegable.current?.open) {
        desplegable.current.open = false
        desplegable.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', cerrarFuera)
    document.addEventListener('keydown', cerrarEscape)
    return () => {
      document.removeEventListener('pointerdown', cerrarFuera)
      document.removeEventListener('keydown', cerrarEscape)
    }
  }, [])

  if (consultaError) {
    return <span role="status" className="my-1 inline-block rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-700">
      ⚠ Cobros sin verificar
    </span>
  }
  if (!resumen || resumen.total <= 0) return null

  const productos = resumen.productos.map(p =>
    String(p.cantidad) + ' ' + getProductoIconConfig(p.producto).label)
  const linkFiados = '/pedidos?tab=fiados&fiadosCliente=' + encodeURIComponent(clienteId)

  return (
    <div
      ref={contenedor}
      className="group relative my-1 block w-full max-w-full align-middle md:inline-block md:w-auto"
      data-testid={'fiados-anteriores-' + pedidoId}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <details ref={desplegable} className="peer w-fit max-w-full">
        <summary
          className="inline-flex min-h-8 max-w-full cursor-pointer list-none items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden"
          aria-label={'Cobro pendiente: ' + formatCurrency(resumen.total) + ' en otros pedidos. Ver detalles.'}
        >
          <span aria-hidden="true">💰</span>
          <span>Cobro pendiente</span>
        </summary>
      </details>
      <div
        className="relative z-20 mt-2 hidden w-full max-w-full rounded-lg border border-amber-300 bg-white p-3 text-left text-xs font-normal text-stone-800 shadow-lg peer-open:block md:absolute md:left-0 md:top-full md:mt-1 md:w-72 md:max-w-[calc(100vw-2rem)] md:shadow-xl md:group-hover:block md:group-focus-within:block"
        role="region"
        aria-label="Detalle de otros cobros pendientes"
      >
        <p className="font-semibold">Otros pedidos con cobro pendiente</p>
        <dl className="mt-2 space-y-1">
          <div className="flex justify-between gap-2">
            <dt>Otros pedidos ({resumen.pedidos})</dt>
            <dd className="font-semibold">{formatCurrency(resumen.total)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Este pedido</dt>
            <dd className="font-semibold">{formatCurrency(resumen.propio)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-stone-200 pt-1 font-semibold">
            <dt>Total pendiente del titular</dt>
            <dd>{formatCurrency(resumen.totalCliente)}</dd>
          </div>
        </dl>
        <p className="mt-2 font-semibold">Pedidos de origen</p>
        <ul className="mt-1 space-y-1">
          {resumen.origenes.map(origen => (
            <li key={origen.id} className="break-words">
              Pedido #{origen.numero}
              {origen.negocio ? ' · ' + origen.negocio : ''}
              {' · ' + formatCurrency(origen.importe)}
            </li>
          ))}
        </ul>
        <p className="mt-2 font-semibold">Productos entregados asociados</p>
        {productos.length ? (
          <ul className="mt-1 list-inside list-disc">
            {resumen.productos.map(p => (
              <li key={p.producto}>{p.cantidad} {getProductoIconConfig(p.producto).label}</li>
            ))}
          </ul>
        ) : <p className="mt-1 text-stone-600">Sin desglose verificable</p>}
        {resumen.pagoPorConfirmar && <p className="mt-2 font-medium text-amber-900">
          ⚠ Hay un pago reportado por confirmar. La conciliación puede cambiar el importe.
        </p>}
        <p className="mt-2 text-[11px] text-stone-600">
          Productos entregados en pedidos con deuda, no unidades individuales impagas.
          Importe de la última consulta; se verificará al cobrar.
        </p>
        <a
          href={linkFiados}
          className="mt-2 inline-flex min-h-9 items-center rounded-md border border-amber-300 px-2 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          Ver fiados del cliente
        </a>
      </div>
    </div>
  )
}
