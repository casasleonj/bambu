'use client'

import { getNegocioSearchMatch } from '@/lib/cliente-filters'
import type { NegocioDetail } from '@/components/negocio-detail-modal'

interface NegocioSearchMatchCliente {
  id: string
  negocios?: Array<{
    id: string
    nombre: string
    tipoNegocio?: string | null
    direccion?: string | null
    barrio?: string | null
    referencia?: string | null
    linkUbicacion?: string | null
  }> | null
}

interface NegocioSearchMatchProps {
  cliente: NegocioSearchMatchCliente
  search: string
  onViewNegocio: (negocio: NegocioDetail) => void
  onViewCliente: (id: string) => void
}

export function NegocioSearchMatch({
  cliente,
  search,
  onViewNegocio,
  onViewCliente,
}: NegocioSearchMatchProps) {
  const { matchedNegocios } = getNegocioSearchMatch(cliente, search)
  if (matchedNegocios.length === 0) return null

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (matchedNegocios.length === 1) {
      const negocio = cliente.negocios?.find((n) => n.id === matchedNegocios[0].id)
      if (negocio) {
        onViewNegocio({
          id: negocio.id,
          nombre: negocio.nombre,
          tipoNegocio: negocio.tipoNegocio ?? null,
          direccion: negocio.direccion ?? null,
          barrio: negocio.barrio ?? null,
          referencia: negocio.referencia ?? null,
          linkUbicacion: negocio.linkUbicacion ?? null,
          horaApertura: null,
          ruta: null,
          _count: { pedidos: 0 },
        })
      }
    } else {
      onViewCliente(cliente.id)
    }
  }

  const label =
    matchedNegocios.length === 1
      ? `Coincide con el negocio: ${matchedNegocios[0].nombre}`
      : `Coincide con ${matchedNegocios.length} negocios`

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-0.5 inline-flex items-center gap-1 text-left text-xs font-medium text-blue-600 hover:text-blue-800 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label={label}
    >
      <svg
        className="h-3 w-3 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      {label}
    </button>
  )
}
