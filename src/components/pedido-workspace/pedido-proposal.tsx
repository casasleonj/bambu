'use client'

import { PRODUCTO_INFO } from '@/lib/prices'
import type { Propuesta } from './build-propuestas'

const CODIGO_TO_NOMBRE: Record<string, string> = Object.fromEntries(
  Object.values(PRODUCTO_INFO).map((i) => [i.codigo, i.nombre]),
)

export interface PedidoProposalProps {
  propuestas: Propuesta[]
  loading: boolean
  cargado: boolean
  onPedir: () => void
  onUsar: (p: Propuesta) => void
  onDescartar: () => void
}

/**
 * PedidoProposal (blueprint §3, intención "repetir") — "Repetir" es una
 * intención, no una plantilla. Ofrece repetir el pedido anterior o el patrón
 * de consumo del cliente. **Aplicar es siempre explícito** (nunca se
 * autocompleta el draft); la carga es bajo demanda (offline-first).
 */
export function PedidoProposal({ propuestas, loading, cargado, onPedir, onUsar, onDescartar }: PedidoProposalProps) {
  if (loading) {
    return <p className="text-xs text-gray-400" data-testid="proposal-loading">Buscando pedidos anteriores…</p>
  }

  if (!cargado) {
    return (
      <button
        type="button"
        data-testid="proposal-pedir"
        onClick={onPedir}
        className="text-xs text-blue-600 underline hover:text-blue-700"
      >
        ↻ Repetir un pedido anterior
      </button>
    )
  }

  if (propuestas.length === 0) {
    return <p className="text-xs text-gray-400" data-testid="proposal-vacio">Sin pedidos anteriores para repetir.</p>
  }

  return (
    <div className="space-y-2" data-testid="workspace-proposal">
      {propuestas.map((p) => (
        <div key={p.id} data-testid={`proposal-${p.id}`} className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-800">{p.titulo}</p>
          <p className="mt-0.5 text-[11px] text-blue-700">
            {p.lineas.map((l) => `${l.cantidad} ${CODIGO_TO_NOMBRE[l.producto] ?? l.producto}`).join(' · ')}
            {p.canal ? ` · ${p.canal === 'DOMICILIO' ? 'Domicilio' : 'Punto'}` : ''}
          </p>
          <button
            type="button"
            data-testid={`proposal-usar-${p.id}`}
            onClick={() => onUsar(p)}
            className="mt-2 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            Usar
          </button>
        </div>
      ))}
      <button
        type="button"
        data-testid="proposal-descartar"
        onClick={onDescartar}
        className="text-[11px] text-gray-400 hover:text-gray-600"
      >
        Empezar en blanco
      </button>
    </div>
  )
}
