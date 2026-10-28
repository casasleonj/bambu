'use client'
import type { MouseEvent } from 'react'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'
import { canReadFacturas } from '@/lib/permissions'

export interface AccesoDocumentosPedido {
  onOpenPedido?: (id: string, volver?: string) => void
  onOpenFactura?: (id: string, volver?: string) => void
  userRole?: string | null
}
interface Props extends AccesoDocumentosPedido {
  pedidoId: string
  numero?: number
  facturaId?: string | null
  facturaNumero?: string | null
  volver?: string
}
export function PedidoDocumentLinks({ pedidoId, numero, facturaId, facturaNumero, onOpenPedido, onOpenFactura, userRole, volver }: Props) {
  const params = useShallowSearchParams()
  const q = new URLSearchParams(params.toString())
  q.set('openPedido', pedidoId)
  const intercept = (e: MouseEvent<HTMLAnchorElement>, action?: () => void) => {
    if (action && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); action() }
  }
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
    <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={`/pedidos?${q}`}
      onClick={e => intercept(e, onOpenPedido ? () => onOpenPedido(pedidoId, volver) : undefined)}>Ver pedido{numero !== undefined ? ` #${numero}` : ''}</a>
    {facturaId && canReadFacturas(userRole) && <a className="inline-flex min-h-11 items-center text-blue-700 underline"
      href={`/facturas?${new URLSearchParams({ openFactura: facturaId, volver: `/pedidos?${params.toString()}` })}`}
      onClick={e => intercept(e, onOpenFactura ? () => onOpenFactura(facturaId, volver) : undefined)}>Ver factura {facturaNumero || ''}</a>}
  </div>
}
