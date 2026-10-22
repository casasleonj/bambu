/**
 * ClienteResultado — una fila del buscador de cliente de los modales de pedido (#385).
 *
 * Línea 1: titular (resaltado) + insignias de deuda / bloqueo.
 * Líneas de motivo: SOLO cuando la coincidencia no fue el nombre del titular:
 *   🏪 negocio (y de quién es, por la línea 1), 👤 contacto con su relación, 📱 celular.
 * Última línea: celular · barrio · dirección (distingue homónimos) y cuántos negocios tiene.
 */

import { Fragment } from 'react'
import { formatCurrency } from '@/lib/utils'
import {
  explicarCoincidencia,
  segmentarCoincidencias,
  celularLegible,
  negocioAPreseleccionar,
  type NegocioPreseleccionado,
  type MotivoCoincidencia,
} from '@/lib/cliente-coincidencia'
import type { Cliente } from './types'

function Resaltado({ texto, term }: { texto: string; term: string }) {
  return (
    <>
      {segmentarCoincidencias(texto, term).map((s, i) =>
        s.coincide ? (
          <mark key={i} className="bg-yellow-100 text-inherit rounded-sm">{s.texto}</mark>
        ) : (
          <Fragment key={i}>{s.texto}</Fragment>
        ),
      )}
    </>
  )
}

function Motivo({ motivo, term }: { motivo: MotivoCoincidencia; term: string }) {
  switch (motivo.tipo) {
    case 'negocio':
      return (
        <>
          🏪 <Resaltado texto={motivo.nombre} term={term} />
          {motivo.tipoNegocio && motivo.tipoNegocio !== motivo.nombre && (
            <span className="text-gray-500"> · <Resaltado texto={motivo.tipoNegocio} term={term} /></span>
          )}
          {(motivo.barrio || motivo.direccion) && (
            <span className="text-gray-500"> · {[motivo.barrio, motivo.direccion].filter(Boolean).join(' · ')}</span>
          )}
        </>
      )
    case 'contacto':
      return (
        <>
          👤 <Resaltado texto={motivo.nombre} term={term} />
          {motivo.relacion && <span> (<Resaltado texto={motivo.relacion} term={term} />)</span>}
          <span className="text-gray-500"> · {celularLegible(motivo.telefono)}</span>
        </>
      )
    case 'celular':
      return <>📱 {celularLegible(motivo.telefono)}</>
    case 'notas':
      return <>📝 <Resaltado texto={motivo.texto} term={term} /></>
  }
}

interface ClienteResultadoProps {
  cliente: Cliente
  term: string
  onSelect: (cliente: Cliente, negocio?: NegocioPreseleccionado | null) => void
}

export function ClienteResultado({ cliente, term, onSelect }: ClienteResultadoProps) {
  const nombreCompleto = `${cliente.nombre}${cliente.apellido ? ` ${cliente.apellido}` : ''}`
  const motivos = explicarCoincidencia(cliente, term)
  const deuda = cliente.saldoPendiente ?? 0
  const nNegocios = cliente.negocios?.length ?? 0
  const detalle = [
    cliente.telefono ? `📱 ${celularLegible(cliente.telefono)}` : null,
    [cliente.barrio, cliente.direccion].filter(Boolean).length > 0
      ? `📍 ${[cliente.barrio, cliente.direccion].filter(Boolean).join(' · ')}`
      : null,
    nNegocios > 0 ? `🏪 ${nNegocios} negocio${nNegocios === 1 ? '' : 's'}` : null,
  ].filter(Boolean)

  return (
    <button
      type="button"
      data-testid="cliente-search-result"
      onClick={() => onSelect(cliente, negocioAPreseleccionar(cliente, term))}
      className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-gray-50 border-b last:border-b-0 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium"><Resaltado texto={nombreCompleto} term={term} /></span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {cliente.bloqueado && (
            <span data-testid="cliente-search-bloqueado" className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Bloqueado</span>
          )}
          {deuda > 0 && (
            <span data-testid="cliente-search-deuda" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Debe {formatCurrency(deuda)}</span>
          )}
        </span>
      </div>
      {motivos.map((m, i) => (
        <div key={i} data-testid="cliente-search-motivo" className="mt-0.5 text-xs text-blue-700">
          <Motivo motivo={m} term={term} />
        </div>
      ))}
      {detalle.length > 0 && (
        <div className="mt-0.5 text-xs leading-snug text-gray-500">{detalle.join(' · ')}</div>
      )}
    </button>
  )
}
