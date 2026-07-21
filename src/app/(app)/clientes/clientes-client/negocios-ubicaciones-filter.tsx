'use client'

import React from 'react'
import type { MostrarNegocio, UbicacionMapsFilter } from './types'

interface NegociosUbicacionesFilterProps {
  mostrarNegocio: MostrarNegocio
  ubicacionMaps: UbicacionMapsFilter
  onChangeMostrarNegocio: (valor: MostrarNegocio) => void
  onChangeUbicacionMaps: (valor: UbicacionMapsFilter) => void
}

const SELECT_STYLES =
  'text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none'

export const NegociosUbicacionesFilter = React.memo(function NegociosUbicacionesFilter({
  mostrarNegocio,
  ubicacionMaps,
  onChangeMostrarNegocio,
  onChangeUbicacionMaps,
}: NegociosUbicacionesFilterProps) {
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

      <label className="inline-flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Ubicación:</span>
        <select
          value={ubicacionMaps}
          onChange={(e) => onChangeUbicacionMaps(e.target.value as UbicacionMapsFilter)}
          className={SELECT_STYLES}
          aria-label="Filtrar por ubicación de Maps"
        >
          <option value="todos">Todos</option>
          <option value="cliente">Cliente con link</option>
          <option value="clienteSin">Cliente sin link</option>
          <option value="negocios">Negocio con link</option>
          <option value="negociosSin">Negocio sin link</option>
        </select>
      </label>
    </div>
  )
})
