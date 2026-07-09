'use client'

import React from 'react'
import type { MostrarNegocio } from './types'

interface NegociosUbicacionesFilterProps {
  mostrarNegocio: MostrarNegocio
  todosNegociosConLink: boolean
  clienteConLink: boolean
  onChangeMostrarNegocio: (valor: MostrarNegocio) => void
  onToggleTodosNegociosConLink: () => void
  onToggleClienteConLink: () => void
}

const SELECT_STYLES =
  'text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none'

const TOGGLE_BASE =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition'

export const NegociosUbicacionesFilter = React.memo(function NegociosUbicacionesFilter({
  mostrarNegocio,
  todosNegociosConLink,
  clienteConLink,
  onChangeMostrarNegocio,
  onToggleTodosNegociosConLink,
  onToggleClienteConLink,
}: NegociosUbicacionesFilterProps) {
  const todosConLinkDeshabilitado = mostrarNegocio === 'sin'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Negocio:</span>
        <select
          value={mostrarNegocio}
          onChange={(e) => onChangeMostrarNegocio(e.target.value as MostrarNegocio)}
          className={SELECT_STYLES}
          aria-label="Filtrar por negocio"
        >
          <option value="todos">Todos</option>
          <option value="con">Con negocio</option>
          <option value="sin">Sin negocio</option>
        </select>
      </label>

      <button
        type="button"
        onClick={onToggleTodosNegociosConLink}
        disabled={todosConLinkDeshabilitado}
        title={
          todosConLinkDeshabilitado
            ? 'Solo aplica cuando se filtra "Con negocio"'
            : 'Mostrar solo clientes cuyos negocios formales tienen link de Maps'
        }
        className={`${TOGGLE_BASE} ${
          todosNegociosConLink
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : todosConLinkDeshabilitado
              ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
        }`}
        aria-pressed={todosNegociosConLink}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Negocios con link
      </button>

      <button
        type="button"
        onClick={onToggleClienteConLink}
        className={`${TOGGLE_BASE} ${
          clienteConLink
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
        }`}
        aria-pressed={clienteConLink}
        title="Mostrar solo clientes con link de Maps propio"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        Cliente con link
      </button>
    </div>
  )
})
